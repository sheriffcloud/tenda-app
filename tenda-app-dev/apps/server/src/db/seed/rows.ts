/**
 * Seed row BUILDER — pure, no database. Fully manifest + secrets driven,
 * nothing chain-shaped is hardcoded:
 *   - which chains  ← the ACTIVE chain secrets (chains/secrets/)
 *   - display/confirmations/token addresses ← the shared CHAIN_MANIFEST
 *   - solana escrow program id ← @tenda/shared/idl (the deployed artifact)
 *   - EVM escrow + treasury    ← the chain's secrets
 *   - solana USDC mint         ← the chain's secret (`fromSecret`); skipped + warned if unset
 *   - gas-seed columns ← manifest `gasSeedAmountRaw` + the funder address DERIVED
 *     from the chain's hot-wallet secret (features/gas-seed, any
 *     namespace); both stay NULL until BOTH exist (#40), the paired CHECK
 *     constraint requires both-or-neither, and a declared-but-unfunded seed is
 *     reported through `skipped` rather than going quiet.
 *
 * The I/O half lives in ./apply.
 */

import { assets, chain_contracts, chains } from '@tenda/shared/db/schema/chains'
import { ASSET_META, chainById, type ChainAsset } from '@tenda/shared'
import { escrowAddressOf } from '@server/chains/registry-sync'
// Leaf import, not the barrel: this module documents itself as pure (no
// database), and the barrel pulls in the registry + boot probe, which import
// drizzle and the db type.
import { normalizeContractAddress } from '@server/chains/contracts/normalize'
import { chainEnvPrefix, type ResolvedChainSecret } from '@server/chains/secrets'
// The feature's public entry, and a leaf by the rule above: it exposes the two
// senders plus types and reaches no database, so this pure builder stays pure.
// Removing the gas seed makes THIS the only line here to delete.
import { GAS_SEED_SUPPORT } from '@server/features/gas-seed'
import {
  P2P_INTERNAL_ID,
  P2P_INTERNAL_CAPABILITIES,
  YELLOWCARD_SPEC,
  ONRAMPMONEY_SPEC,
} from '@server/features/fiat-rails'

type ChainRow = typeof chains.$inferInsert
type AssetRow = typeof assets.$inferInsert
type ChainContractRow = typeof chain_contracts.$inferInsert

export interface FiatProviderRow {
  id: string
  display_name: string
  capabilities: { onramp: boolean; offramp: boolean; currencies: string[]; assets: string[] }
  priority: number
  is_enabled: boolean
}

export interface SeedRows {
  chains: ChainRow[]
  assets: AssetRow[]
  /**
   * The CURRENT contract per chain, to be appended to the escrow-contract
   * history (insert-if-absent, never an update — see ./apply).
   */
  chain_contracts: ChainContractRow[]
  fiat_providers: FiatProviderRow[]
  /** Config that was declared but could not be applied, and why. */
  skipped: string[]
}

/**
 * Resolve an asset's seedable token address. A `fromSecret` asset (Solana USDC
 *, the mint differs per cluster and is not canonical) is supplied by the
 * chain's secret and skipped when absent; otherwise the manifest token (canonical
 * EVM contract) or `null` (native) is used.
 */
function resolveAssetToken(
  asset: ChainAsset,
  secret: ResolvedChainSecret,
): { token: string | null; skip: boolean } {
  if (asset.fromSecret === undefined) return { token: asset.token, skip: false }
  if (secret.namespace === 'solana' && asset.fromSecret === 'usdcMint') {
    return secret.usdcMint !== undefined
      ? { token: secret.usdcMint, skip: false }
      : { token: null, skip: true }
  }
  return { token: null, skip: true }
}

/**
 * The paired gas-seed columns for a chain. Both are set only when the manifest
 * declares a seed amount AND the deployment configured the hot-wallet secret
 * that funds it — otherwise both stay NULL, keeping the chain's seed dormant and
 * satisfying the `chains_gas_seed_paired_chk` (both-or-neither) constraint. The
 * funder address is DERIVED from the same secret the sender signs with (no drift).
 *
 * The `skipped` note is the answer to how this used to go wrong (#53a): the
 * namespace check here was `=== 'solana'`, so an EVM chain that declared a seed
 * amount silently seeded NULL, dispatch never saw the chain, and NOTHING said
 * so — not at boot, not at seed time, not on the wire. A declared seed that
 * cannot be paid is now reported wherever the seeder reports its other skips.
 */
function resolveGasSeed(
  amount_raw: string | undefined,
  secret: ResolvedChainSecret,
): { amount_raw: string | null; wallet_address: string | null; skipped: string | null } {
  const key = secret.gasSeedKey
  if (amount_raw === undefined) return { amount_raw: null, wallet_address: null, skipped: null }
  if (key === undefined) {
    return {
      amount_raw: null,
      wallet_address: null,
      // The EXACT variable, built with the loader's own prefix helper — the #57
      // lesson: the person who reads this is looking at container logs without
      // the source, and a bare suffix costs them the hop.
      skipped: `gas seed on ${secret.chainId} (${chainEnvPrefix(secret.chainId)}_GAS_SEED_KEY not configured)`,
    }
  }
  return {
    amount_raw,
    wallet_address: GAS_SEED_SUPPORT[secret.namespace].addressFromKey(key),
    skipped: null,
  }
}

export function buildSeedRows(secrets: ReadonlyMap<string, ResolvedChainSecret>): SeedRows {
  const chainRows: ChainRow[] = []
  const assetRows: AssetRow[] = []
  const chainContractRows: ChainContractRow[] = []
  const skipped: string[] = []

  // symbol/decimals/is_stable come from the shared ASSET_META registry,
  // the seed only contributes the deployment-specific chain/token wiring.
  function assetRow(id: string, chain_id: string, token_address: string | null): AssetRow {
    const meta = ASSET_META[id]
    if (meta === undefined) throw new Error(`asset '${id}' missing from shared ASSET_META`)
    return { id, chain_id, symbol: meta.symbol, decimals: meta.decimals, token_address, is_stable: meta.is_stable }
  }

  // One row set per ACTIVE chain. Solana's escrow program id is the deployed
  // IDL artifact (single source); EVM's is the deployed contract from secrets.
  for (const secret of secrets.values()) {
    const entry = chainById(secret.chainId)
    const gasSeed = resolveGasSeed(entry.gasSeedAmountRaw, secret)
    if (gasSeed.skipped !== null) skipped.push(gasSeed.skipped)
    chainRows.push({
      id: entry.id,
      namespace: entry.namespace,
      display_name: entry.displayName,
      min_confirmations: entry.minConfirmations,
      treasury_address: secret.treasury,
      escrow_program: escrowAddressOf(secret),
      gas_seed_amount_raw: gasSeed.amount_raw,
      gas_seed_wallet_address: gasSeed.wallet_address,
    })
    // The same address again, but as HISTORY rather than as current state. A
    // redeploy changes `chains.escrow_program` in place and appends here, so the
    // superseded contract stays known and escrows still funded by it keep
    // transacting (open_issues #89). Normalised at the point of writing so the
    // stored spelling and every later comparison agree.
    chainContractRows.push({
      chain_id: entry.id,
      address: normalizeContractAddress(entry.namespace, escrowAddressOf(secret)),
      deploy_block:
        secret.namespace === 'eip155' && secret.escrowDeployBlock !== undefined
          ? secret.escrowDeployBlock
          : null,
    })
    for (const asset of entry.assets) {
      const resolved = resolveAssetToken(asset, secret)
      if (resolved.skip) {
        skipped.push(`${asset.id} on ${entry.id} (${asset.fromSecret} not configured)`)
        continue
      }
      assetRows.push(assetRow(asset.id, entry.id, resolved.token))
    }
  }

  // Stage 8: routing registry (enable/priority only, credentials live in
  // env; a provider without keys is simply never constructed).
  // Capabilities are single-sourced from the provider definitions (licensed
  // specs + the derived p2p surface) so this admin-visible row can't drift from
  // the live routing. Only priority/enablement are seed-tunable defaults.
  const fiatProviderRows: FiatProviderRow[] = [
    {
      id: YELLOWCARD_SPEC.id,
      display_name: 'Yellow Card',
      capabilities: YELLOWCARD_SPEC.capabilities,
      priority: 10,
      is_enabled: true,
    },
    {
      id: ONRAMPMONEY_SPEC.id,
      display_name: 'Onramp.money',
      capabilities: ONRAMPMONEY_SPEC.capabilities,
      priority: 20,
      is_enabled: true,
    },
    {
      id: P2P_INTERNAL_ID,
      display_name: 'Tenda P2P',
      capabilities: P2P_INTERNAL_CAPABILITIES,
      priority: 100,
      is_enabled: true,
    },
  ]

  return {
    chains: chainRows,
    assets: assetRows,
    chain_contracts: chainContractRows,
    fiat_providers: fiatProviderRows,
    skipped,
  }
}
