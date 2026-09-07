/**
 * Listener boot plugin (stage-2-listeners.md § plugins/listeners.ts).
 *
 * Provider is INFERRED per chain from its secrets, not a separate env:
 *   - WEBHOOK_SECRET set  → push intake (Helius for Solana, Alchemy for EVM):
 *     the webhook route is the intake; nothing to start here.
 *   - WEBHOOK_SECRET unset → self-hosted polling fallback: start the
 *     chain_cursors-driven loop and stop it on shutdown. To fail open during
 *     a provider outage, unset the chain's WEBHOOK_SECRET (stage-2 risk table).
 *
 * The same rule covers every namespace, so a chain graduates from polling to
 * push by setting one secret — no code change.
 */

import fp from 'fastify-plugin'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { chainById } from '@tenda/shared'
import { getChainSecrets, solanaSecret } from '@server/chains/secrets'
import { drizzleCursorStore } from '@server/chains/cursors'
import { createSolanaRpc } from '@server/chains/solana/rpc'
import {
  createSolanaPollingListener,
  SOLANA_LISTENER_RPC_TIMEOUT_MS,
} from '@server/chains/solana/listener-polling'
import { createEvmRpc } from '@server/chains/evm/rpc'
import {
  createEvmPollingListener,
  EVM_LISTENER_RPC_TIMEOUT_MS,
  type EvmPollTickDeps,
} from '@server/chains/evm/listener-polling'
import type { ChainListener } from '@server/chains/types'

/**
 * The addresses an EVM chain's listener watches: every contract the registry
 * knows for it.
 *
 * The registry already guarantees the configured contract is in that set (see
 * `buildContractRegistry` — the union with `current` is not optional), so the
 * fallback here fires only for a chain the registry has no entry for at all,
 * where watching the configured address alone is exactly the old behaviour.
 *
 * The cast is a boundary one: these addresses reach the registry from the
 * `evmAddr`-validated chain secrets, so they are 0x-hex by construction, and
 * `chains/index.ts` casts the same value on the same grounds.
 */
export function evmWatchSet(
  fastify: FastifyInstance,
  chain_id: string,
  configured: string,
): readonly `0x${string}`[] {
  const known = fastify.contracts.get(chain_id)?.known
  const addresses = known !== undefined ? [...known] : [configured.toLowerCase()]
  return addresses as `0x${string}`[]
}

/**
 * The poll configuration for every EVM chain that needs a self-hosted listener.
 *
 * Separated from the plugin so the CONFIGURATION is assertable without waiting
 * on a 15-second interval — in particular `escrow_contracts`, which is the whole
 * point of the multi-generation watch set and the kind of value that has already
 * once been computed correctly and then never passed on. The plugin's remaining
 * job is a direct hand-off of each of these to `createEvmPollingListener`.
 */
export function evmListenerDeps(fastify: FastifyInstance): EvmPollTickDeps[] {
  const plans: EvmPollTickDeps[] = []
  for (const secret of getChainSecrets().values()) {
    if (secret.namespace !== 'eip155' || secret.webhookSecret !== undefined) continue
    if (!fastify.chains.has(secret.chainId)) {
      fastify.log.warn(
        { chain_id: secret.chainId },
        'polling listener: no adapter registered for configured EVM chain, not started',
      )
      continue
    }
    if (secret.escrowDeployBlock === undefined) {
      // Loud, once at boot: without the deploy block a FIRST run only
      // backfills the recency window; older escrow events stay unscanned.
      fastify.log.warn(
        { chain_id: secret.chainId },
        'polling listener: ESCROW_DEPLOY_BLOCK unset, first-run backfill limited to the recency window',
      )
    }
    // Current AND superseded contracts. `fastify.contracts` is already built
    // (this plugin depends on `chains`, which decorates it), so the watch set
    // needs no query of its own and cannot disagree with the set the build and
    // verify paths use.
    const escrow_contracts = evmWatchSet(fastify, secret.chainId, secret.escrow)
    if (escrow_contracts.length === 0) {
      // REFUSE rather than watch (#45). An empty address array is not "match
      // nothing" to `eth_getLogs` — it is "no address filter", measured against
      // a real node: getLogRefs([]) and getLogRefs([USDC]) returned the same
      // refs. So a listener started on an empty set would enqueue a verify-tx
      // job for every log-bearing transaction on the chain, swamping the queue
      // and breaking verification for every chain, not just this one.
      //
      // Skipping loses nothing that flooding would have preserved: neither is a
      // working backstop. Unreachable today — `buildContractRegistry` seeds
      // `known` with `current` and the union "is not optional" — so this guards
      // the invariant rather than a live path, and says so loudly if it ever
      // stops holding.
      fastify.log.warn(
        { chain_id: secret.chainId },
        'polling listener: empty contract watch set for configured EVM chain, not started',
      )
      continue
    }
    plans.push({
      rpc: createEvmRpc({
        rpc_url: secret.rpcUrl,
        ...(secret.rpcUrlFallback !== undefined ? { rpc_url_fallback: secret.rpcUrlFallback } : {}),
        // Background poller: relaxed per-endpoint budget, not the
        // interactive tx-build one (see the constant's rationale).
        timeout_ms: EVM_LISTENER_RPC_TIMEOUT_MS,
      }),
      chain_id: secret.chainId,
      escrow_contracts,
      ...(secret.escrowDeployBlock !== undefined ? { deploy_block: secret.escrowDeployBlock } : {}),
      min_confirmations: chainById(secret.chainId).minConfirmations,
      cursors: drizzleCursorStore(fastify.db),
      queue: fastify.queue,
      log: fastify.log,
    })
  }
  return plans
}

const listenersPlugin: FastifyPluginAsync = async (fastify) => {
  const listeners: ChainListener[] = []

  const solana = solanaSecret()
  if (solana !== undefined && solana.webhookSecret === undefined) {
    const adapter = fastify.chains.list().find((a) => a.namespace === 'solana')
    if (adapter === undefined) {
      fastify.log.warn({}, 'polling listener: no solana adapter registered, not started')
    } else {
      listeners.push(
        createSolanaPollingListener({
          rpc: createSolanaRpc({
            rpc_url: solana.rpcUrl,
            ...(solana.rpcUrlFallback !== undefined ? { rpc_url_fallback: solana.rpcUrlFallback } : {}),
            chain_id: adapter.chain_id,
            // Background poller: relaxed per-endpoint budget, not the
            // interactive tx-build one (see the constant's rationale).
            timeout_ms: SOLANA_LISTENER_RPC_TIMEOUT_MS,
          }),
          chain_id: adapter.chain_id,
          cursors: drizzleCursorStore(fastify.db),
          queue: fastify.queue,
          log: fastify.log,
        }),
      )
    }
  }

  // Direct hand-off: every field these listeners poll with was decided in
  // `evmListenerDeps` above, which is where the watch set is asserted.
  for (const deps of evmListenerDeps(fastify)) {
    listeners.push(createEvmPollingListener(deps))
  }

  if (listeners.length === 0) return
  fastify.addHook('onReady', async () => {
    for (const listener of listeners) await listener.start()
  })
  fastify.addHook('onClose', async () => {
    for (const listener of listeners) await listener.stop()
  })
}

export default fp(listenersPlugin, { name: 'listeners', dependencies: ['db', 'chains', 'queue'] })
