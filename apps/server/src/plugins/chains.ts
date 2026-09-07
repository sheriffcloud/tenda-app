/**
 * Chain adapter registry plugin. Builds the registry once at boot and
 * decorates `fastify.chains` so routes can resolve adapters by `chain_id`
 * without re-running the factory per request.
 *
 * Post-cutover (#34) the resolvers are DB-backed:
 *   - wallet: `user_wallets` (multi-wallet, decision #13), primary wallet
 *     first, falling back to the only linked wallet for the namespace.
 *   - asset:  the seeded `assets` registry table, keyed (id, chain_id).
 */

import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { and, desc, eq, sql } from 'drizzle-orm'
import { assets, user_wallets } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { buildAdapters, buildChainRegistry, type AdapterDepsFactory } from '@server/chains'
import type { EvmAdapterDeps } from '@server/chains/evm'
import { fetchPaymasterHttp } from '@server/chains/evm/paymaster'
import { assertChainRegistryInSync } from '@server/chains/registry-sync'
import {
  assertEscrowContractsKnown,
  contractSourcesFromSecrets,
  loadContractRegistry,
} from '@server/chains/contracts'
import { getChainSecrets } from '@server/chains/secrets'
import { AppError } from '@server/lib/errors'
import { drizzleSponsorStore, releaseSponsoredTx, reserveSponsoredTx } from '@server/lib/sponsor'

type ChainNs = 'solana' | 'eip155'

const chainsPlugin: FastifyPluginAsync = async (fastify) => {

  /**
   * One linked wallet per (user, namespace) serves every chain in that
   * namespace. Primary first so a user with several linked wallets gets
   * deterministic resolution.
   */
  function dbWalletResolver(chain_ns: ChainNs): (user_id: string) => Promise<string> {
    return async (user_id) => {
      const rows = await fastify.db
        .select({ address: user_wallets.address })
        .from(user_wallets)
        .where(and(eq(user_wallets.user_id, user_id), eq(user_wallets.chain_ns, chain_ns)))
        .orderBy(desc(user_wallets.is_primary))
        .limit(1)
      const wallet = rows[0]?.address
      if (wallet === undefined) {
        throw new AppError(
          404,
          ErrorCode.USER_NOT_FOUND,
          `no ${chain_ns} wallet linked for user ${user_id}`,
        )
      }
      return wallet
    }
  }

  /** Assets registry lookup, seeded by db:seed; Stages 3/4 add EVM rows. */
  function dbAssetResolver(chain_id: string): (asset: string) => Promise<{ token_address: string | null }> {
    return async (asset) => {
      const rows = await fastify.db
        .select({ token_address: assets.token_address })
        .from(assets)
        .where(and(eq(assets.id, asset), eq(assets.chain_id, chain_id), eq(assets.is_enabled, true)))
        .limit(1)
      const row = rows[0]
      if (row === undefined) {
        throw new AppError(
          422,
          ErrorCode.ESCROW_INVALID_ASSET,
          `asset '${asset}' is not registered (or disabled) on ${chain_id}`,
        )
      }
      return { token_address: row.token_address }
    }
  }

  /**
   * Per-chain deps, selected by `gasPolicy` (not bespoke per-chain keys):
   *   - solana: wallet + asset resolvers.
   *   - paymaster EVM (BASE-style): adds the reserve-at-build sponsorship
   *     probe + symmetric release, and the paymaster client when its URL is
   *     configured. Reserve IS the atomic quota decrement; the reconcile cron
   *     repairs drift when a sponsored build never lands.
   *   - feeCurrency / none EVM (CELO-style): plain resolvers, gas rides
   *     feeCurrency, no probe, counter never touched.
   * A new EVM chain inherits the right wiring from its manifest gasPolicy
   * with no edit here.
   */
  const depsFactory: AdapterDepsFactory = {
    solana: (chainId) => ({
      resolveWalletAddress: dbWalletResolver('solana'),
      resolveAsset: dbAssetResolver(chainId),
    }),
    evm: (chainId, secret, entry) => {
      const base: EvmAdapterDeps = {
        resolveWalletAddress: dbWalletResolver('eip155'),
        resolveAsset: dbAssetResolver(chainId),
        // Permit-payload gate: the owner must be a linked wallet of the
        // caller (rows only exist after signature verification, verified_at
        // is NOT NULL by construction). Case-insensitive: EVM addresses may
        // be stored checksummed.
        async verifyWalletOwnership(user_id, address) {
          const rows = await fastify.db
            .select({ address: user_wallets.address })
            .from(user_wallets)
            .where(
              and(
                eq(user_wallets.user_id, user_id),
                eq(user_wallets.chain_ns, 'eip155'),
                sql`lower(${user_wallets.address}) = lower(${address})`,
              ),
            )
            .limit(1)
          return rows.length > 0
        },
      }
      if (entry.gasPolicy !== 'paymaster') return base
      return {
        ...base,
        async shouldSponsor(user_id) {
          const result = await reserveSponsoredTx(drizzleSponsorStore(fastify.db), {
            user_id,
            chain_id: chainId,
          })
          return result.sponsored
        },
        async releaseSponsorship(user_id) {
          await releaseSponsoredTx(drizzleSponsorStore(fastify.db), { user_id })
        },
        ...(secret.paymasterUrl !== undefined
          ? { paymaster: fetchPaymasterHttp(secret.paymasterUrl) }
          : {}),
      }
    },
  }

  const secrets = getChainSecrets()

  // Which contracts each chain may transact with, current AND superseded.
  //
  // Built BEFORE the adapters, and from the secrets rather than from the
  // adapters, because the EVM adapter needs the set in order to decode receipts
  // from a superseded contract — deriving it from the adapters instead would
  // leave every one of them holding only its current address, which is the
  // behaviour open_issues #89 exists to remove.
  //
  // Built once at boot, not per request: `seedOnBoot` has already recorded the
  // current contract by this point (server.ts calls it before the app is
  // registered, documented there as load-bearing), and a per-request read would
  // let a DB blip silently narrow the set mid-flight.
  const contracts = await loadContractRegistry(fastify.db, contractSourcesFromSecrets(secrets))

  const adapters = buildAdapters(secrets, depsFactory, contracts)
  if (adapters.length === 0) {
    throw new Error(
      'no chains configured, set CHAIN_<ID>_* env for at least one manifest chain (e.g. CHAIN_SOLANA_DEVNET_RPC_URL)',
    )
  }

  // Refuse to serve a registry that disagrees with the chains we actually
  // transact on. The stored copy is what a stale `db:seed` leaves behind, and
  // it used to be handed to mobile as fact — see chains/registry-sync.ts.
  await assertChainRegistryInSync(fastify.db, secrets, {
    warn: (msg) => fastify.log.warn(msg),
  })

  // A live escrow naming a contract the registry has forgotten means its funds
  // are somewhere we would refuse to transact — fail loud now rather than serve
  // 409s on every one of its transitions. Terminal escrows are exempt (their
  // money already moved), so old history cannot crash-loop a deploy.
  await assertEscrowContractsKnown(fastify.db, contracts)

  fastify.decorate('chains', buildChainRegistry(adapters))
  fastify.decorate('contracts', contracts)
}

export default fp(chainsPlugin, { name: 'chains', dependencies: ['db'] })
