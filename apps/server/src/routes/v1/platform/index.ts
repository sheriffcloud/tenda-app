import { FastifyPluginAsync } from 'fastify'
import { asc, eq } from 'drizzle-orm'
import { chains, assets } from '@tenda/shared/db/schema'
import { getPlatformConfig } from '@server/lib/platform'
import { getExchangeRates } from '@server/features/fiat-rails/rates/exchange-rates'
import {
  assetFundsBySignature,
  chainById,
  isChainEnabled,
  chainPublicFacts,
  exchangeAssetsByChain,
  findChain,
  gigAssetByChain,
  type AssetRole,
  type ChainRegistryEntry,
  type PlatformContract,
} from '@tenda/shared'

/** EIP-2612 capability comes from the manifest (config), not the DB row. */
function supportsPermit(chain_id: string, asset_id: string): boolean {
  const asset = findChain(chain_id)?.assets.find((a) => a.id === asset_id)
  return asset?.permit !== undefined
}

/**
 * What an asset may be used for on this chain, read from the SAME functions
 * the escrow validators refuse with — not from the manifest's `roles` array.
 *
 * The distinction is the point. `gigAssetByChain` returns ONE asset per chain
 * (the first carrying the gig role); a manifest that ever listed two would make
 * the second a role this endpoint advertises and `assertGigAsset` rejects. By
 * asking the enforcer instead, the published answer is by construction the one
 * a caller will get, so this cannot promise what the 422 takes away.
 */
function rolesOf(chain_id: string, asset_id: string): AssetRole[] {
  return [
    ...(gigAssetByChain(chain_id) === asset_id ? (['gig'] as const) : []),
    ...(exchangeAssetsByChain(chain_id).includes(asset_id) ? (['exchange'] as const) : []),
  ]
}

type ConfigRoute        = PlatformContract['config']
type ExchangeRatesRoute = PlatformContract['exchangeRates']
type ChainsRoute        = PlatformContract['chains']

const platformRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/platform/config, public endpoint returning current platform fee
  fastify.get<{
    Reply: ConfigRoute['response']
  }>('/config', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async () => {
    const { fee_bps, seeker_fee_bps, grace_period_seconds } = await getPlatformConfig(fastify.db)
    return { fee_bps, seeker_fee_bps, grace_period_seconds }
  })

  // GET /v1/platform/exchange-rates, public endpoint proxying CoinGecko (5-min server cache)
  // Centralises rate fetching so devices share one quota instead of each calling CoinGecko directly.
  fastify.get<{
    Reply: ExchangeRatesRoute['response']
  }>('/exchange-rates', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async () => {
    return getExchangeRates()
  })

  // GET /v1/platform/chains, enabled chains + their enabled assets (CO5
  // chain/asset picker source). Public.
  //
  // The escrow address comes from the ADAPTER REGISTRY, not from
  // `chains.escrow_program`.
  // Mobile signs its own transactions, so this response is the only way it
  // learns which contract to call — and the DB column is written solely by
  // `db:seed`, while env is re-read every boot. That gap let the column drift
  // two contract generations behind on both EVM testnets with nothing failing
  // server-side (2026-07-27). Serving the value the server itself uses removes
  // the class of bug; `assertChainRegistryInSync` keeps the stored copy honest.
  //
  // A chain enabled in the DB but with no adapter is therefore omitted rather
  // than advertised: the server cannot build or verify a transaction on it, so
  // offering it to a client is offering a dead end.
  fastify.get<{
    Reply: ChainsRoute['response']
  }>('/chains', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const [chainRows, assetRows] = await Promise.all([
      fastify.db
        .select({
          id: chains.id,
          namespace: chains.namespace,
          display_name: chains.display_name,
        })
        .from(chains)
        .where(eq(chains.is_enabled, true))
        .orderBy(asc(chains.id)),
      fastify.db
        .select({
          id: assets.id,
          chain_id: assets.chain_id,
          symbol: assets.symbol,
          decimals: assets.decimals,
          is_stable: assets.is_stable,
          token_address: assets.token_address,
        })
        .from(assets)
        .where(eq(assets.is_enabled, true))
        .orderBy(asc(assets.id)),
    ])

    // A chain is served when the registry holds its adapter AND it is enabled. A
    // PAUSED chain keeps its adapter (existing escrows settle and are listened
    // to) but is not offered: this listing is what every picker reads.
    const served = chainRows.filter((c) => fastify.chains.has(c.id) && isChainEnabled(chainById(c.id)))
    const entries = await Promise.all(
      served.map(async (c): Promise<ChainRegistryEntry[]> => {
        const adapter = fastify.chains.get(c.id)
        // The contract's review window (#148): read on demand through the
        // adapter's cache. A chain whose contract has never answered is omitted
        // like a chain with no adapter — advertising it would promise a claim
        // right this deployment cannot state — and the log names it.
        let approval_window_seconds: number
        try {
          approval_window_seconds = await adapter.approvalWindowSeconds()
        } catch (err) {
          request.log.error({ chain_id: c.id, err }, 'chain omitted from the registry: its review window cannot be read')
          return []
        }
        // The public facts of the chain come from the manifest, through the ONE
        // shared mapping (#137); the facts about THIS deployment — whether it
        // holds a relayer, and the contract's review window — come from the
        // adapter, the same object `relayDraftFunding` refuses on when the relay
        // is absent (#132). Read from the same place so this cannot advertise
        // what the chain denies.
        return [{
          ...c,
          // Total by construction: every adapter is built from a manifest entry.
          network_kind: chainById(c.id).kind,
          escrow_address: adapter.escrowAddress,
          relayed_funding_available: adapter.relay !== undefined,
          approval_window_seconds,
          ...chainPublicFacts(c.id),
          assets: assetRows
            .filter((a) => a.chain_id === c.id)
            .map(({ chain_id: _chain_id, ...asset }) => ({
              ...asset,
              supports_permit: supportsPermit(c.id, asset.id),
              funds_by_signature: assetFundsBySignature(c.id, asset.id),
              roles: rolesOf(c.id, asset.id),
            })),
        }]
      }),
    )
    const data: ChainRegistryEntry[] = entries.flat()
    return { data }
  })
}

export default platformRoutes
