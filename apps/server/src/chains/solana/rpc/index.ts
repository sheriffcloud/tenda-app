/**
 * Thin RPC seam for the Solana adapter.
 *
 * `SolanaRpc` is the complete network surface the adapter touches, builders
 * and verifiers depend on this interface, never on `Connection` directly, so
 * adapter tests run fully offline against a fake (testing-strategy.md:
 * "no real network in unit / route tests").
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { withTimeout } from '@tenda/shared'
import type { ChainId } from '@server/chains/types'
import {
  DEFAULT_RPC_TIMEOUT_MS,
  commitmentFor,
  perEndpointTimeoutMs,
  solanaConnections,
  withRpcFallback,
} from '@server/chains/rpc'

/** Minimal decoded view of a fetched transaction. */
export interface SolanaTxResult {
  /** Whether the runtime recorded an execution error. */
  failed: boolean
  /** Stringified runtime error when `failed`; null otherwise. */
  failure_reason: string | null
  /** Program log messages (event payloads decode from these). */
  log_messages: string[]
}

export interface SolanaRpc {
  getLatestBlockhash(): Promise<{ blockhash: string; last_valid_block_height: number }>
  /** Null = signature unknown / not yet confirmed at the required commitment. */
  getTransaction(tx_ref: string): Promise<SolanaTxResult | null>
  /**
   * Raw account data plus its OWNING program. Null = account does not exist.
   *
   * The owner rides along because Anchor's account discriminator is derived
   * from the account NAME, so it is identical across program generations: an
   * account left behind by a superseded program deserialises perfectly as
   * current state. Data alone cannot tell the two apart; only the owner can.
   */
  getAccount(address: string): Promise<{ data: Buffer; owner: string } | null>
  /**
   * Recent signatures touching an address (newest first), the polling
   * listener's feed. Failed txs are included; verify-tx classifies them.
   */
  getSignaturesForAddress(
    address: string,
    opts: { limit: number },
  ): Promise<Array<{ signature: string; slot: number }>>
}

/**
 * RPC POLICY LIVES IN chains/rpc, NOT HERE — timeouts, commitment, connection
 * config and the fallback rule all moved there when the EVM hot wallet and the
 * gas-seed funder needed the same decisions and each invented their own.
 * Re-exported so this module's existing importers and its test file keep their
 * paths, and so there is still exactly one definition.
 */
export {
  DEFAULT_RPC_TIMEOUT_MS,
  FALLBACK_RPC_TIMEOUT_MS,
  commitmentFor,
  distinctFallbackUrl,
  perEndpointTimeoutMs,
  solanaConnectionConfig,
} from '@server/chains/rpc'

/**
 * Minimal `Connection` surface the wrapper consumes. Tests inject a fake
 * against this port (no web3 Connection, no network); `createSolanaRpc`
 * builds the real Connection, owning commitment + PublicKey construction,
 * and adapts it here.
 */
export interface SolanaConnectionPort {
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>
  getTransaction(
    tx_ref: string,
  ): Promise<{ meta: { err: unknown; logMessages?: string[] | null } | null } | null>
  getAccountInfo(address: string): Promise<{ data: Buffer; owner: string } | null>
  getSignaturesForAddress(
    address: string,
    opts: { limit: number },
  ): Promise<Array<{ signature: string; slot: number }>>
}

/**
 * The per-call budget every Solana network call runs under — the adapter's
 * reads here AND the relayer's reads/writes (relay/relayer.ts): web3's
 * `Connection` has no timeout of its own, so without this a hung endpoint
 * hangs the request.
 */
export function withSolanaRpcTimeout<T>(
  label: string,
  operation: Promise<T>,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
): Promise<T> {
  return withTimeout(operation, timeoutMs, `solana rpc timeout after ${timeoutMs}ms: ${label}`)
}

/**
 * Wrap a connection port into the SolanaRpc the adapter consumes, the
 * testable unit: the per-call timeout race plus response→interface mapping.
 */
export function solanaRpcFromConnection(
  conn: SolanaConnectionPort,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
): SolanaRpc {
  const withRpcTimeout = <T>(label: string, operation: Promise<T>): Promise<T> =>
    withSolanaRpcTimeout(label, operation, timeoutMs)

  return {
    async getLatestBlockhash() {
      const r = await withRpcTimeout('getLatestBlockhash', conn.getLatestBlockhash())
      return { blockhash: r.blockhash, last_valid_block_height: r.lastValidBlockHeight }
    },

    async getTransaction(tx_ref) {
      const tx = await withRpcTimeout(`getTransaction(${tx_ref})`, conn.getTransaction(tx_ref))
      if (tx === null) return null
      const err = tx.meta?.err ?? null
      return {
        failed: err !== null,
        failure_reason: err === null ? null : JSON.stringify(err),
        log_messages: tx.meta?.logMessages ?? [],
      }
    },

    async getAccount(address) {
      const info = await withRpcTimeout(`getAccountInfo(${address})`, conn.getAccountInfo(address))
      return info === null ? null : { data: Buffer.from(info.data), owner: info.owner }
    },

    async getSignaturesForAddress(address, opts) {
      const infos = await withRpcTimeout(
        `getSignaturesForAddress(${address})`,
        conn.getSignaturesForAddress(address, { limit: opts.limit }),
      )
      return infos.map((i) => ({ signature: i.signature, slot: i.slot }))
    },
  }
}

export function createSolanaRpc(args: {
  rpc_url: string
  rpc_url_fallback?: string
  chain_id: ChainId
  timeout_ms?: number
}): SolanaRpc {
  const commitment = commitmentFor(args.chain_id)
  // Clients from the central seam (chains/rpc) — this module no longer decides
  // how many endpoints there are or how they are configured, only how to map
  // one into the port the adapter consumes.
  const connections = solanaConnections(args)
  const buildPort = (connection: Connection): SolanaConnectionPort => {
    return {
      getLatestBlockhash: () => connection.getLatestBlockhash(commitment),
      getTransaction: (tx_ref) =>
        connection.getTransaction(tx_ref, {
          maxSupportedTransactionVersion: 0,
          commitment: commitment === 'confirmed' ? 'confirmed' : 'finalized',
        }),
      // web3.js hands back `owner` as a PublicKey; the port speaks base58 so the
      // seam stays comparable to IDL/config addresses without importing web3.
      getAccountInfo: async (address) => {
        const info = await connection.getAccountInfo(new PublicKey(address), commitment)
        return info === null ? null : { data: info.data, owner: info.owner.toBase58() }
      },
      getSignaturesForAddress: (address, opts) =>
        connection.getSignaturesForAddress(new PublicKey(address), { limit: opts.limit }),
    }
  }
  const timeout_ms = perEndpointTimeoutMs(args)
  const [first, ...rest] = connections.map((c) => solanaRpcFromConnection(buildPort(c), timeout_ms))
  // One endpoint returns the port untouched; two or more fail over per READ.
  return rest.length === 0 ? first : failoverSolanaRpc([first, ...rest])
}

/**
 * Fail over each independent read across `rpcs`, in order, through the one
 * failover combinator (`withRpcFallback`) — this is only the SolanaRpc-shaped
 * facade over it, so there is a single failover mechanism, not two.
 *
 * No `timeout_ms` is passed on purpose: every `SolanaRpc` here comes from
 * `solanaRpcFromConnection`, which already bounds each call, so a hung endpoint
 * rejects and the loop moves on.
 *
 * When EVERY endpoint fails the caller gets the combinator's `AggregateError`
 * (both causes, in endpoint order) rather than only the last endpoint's error.
 */
export function failoverSolanaRpc(rpcs: readonly [SolanaRpc, ...SolanaRpc[]]): SolanaRpc {
  return {
    getLatestBlockhash: () => withRpcFallback(rpcs, (rpc) => rpc.getLatestBlockhash()),
    getTransaction: (ref) => withRpcFallback(rpcs, (rpc) => rpc.getTransaction(ref)),
    getAccount: (address) => withRpcFallback(rpcs, (rpc) => rpc.getAccount(address)),
    getSignaturesForAddress: (address, opts) =>
      withRpcFallback(rpcs, (rpc) => rpc.getSignaturesForAddress(address, opts)),
  }
}
