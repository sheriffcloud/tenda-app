/**
 * The live-escrow disable guard: would this seed strand anybody's money?
 *
 * `applySeedRows` reconciles enablement to the active config, for BOTH chains
 * and assets — but the two disables are NOT equally serious, and conflating
 * them is how a guard gets bypassed by habit. Traced through the call sites:
 *
 *   - a disabled CHAIN is disabled because its `CHAIN_<ID>_*` vars vanished,
 *     which also means no adapter was built, so `fastify.chains.get()` misses
 *     and EVERY transition fails — accept, submit, approve, cancel, refund,
 *     dispute. The escrow still displays. The funds are genuinely trapped.
 *
 *   - a disabled ASSET only blocks CREATION. `dbAssetResolver` is the sole
 *     reader of `assets.is_enabled`, and it is reached only from
 *     `createEscrow` (solana instructions/index.ts, evm buildContext) plus the
 *     EVM permit path. Settlement never re-resolves the asset — the contract
 *     already holds the token address from creation. So existing escrows still
 *     settle; the deployment has just silently stopped offering that token.
 *
 * Both are worth halting a deploy over. They get SEPARATE override flags so
 * that acknowledging the routine one can never wave through the dangerous one.
 *
 * Pure decisions live here and take plain arrays, so they are tested without a
 * database; the queries alongside them are the only I/O.
 */

import { and, eq, inArray, sql as raw } from 'drizzle-orm'
import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { assets, chains, escrows } from '@tenda/shared/db/schema'
import { UNSETTLED_ESCROW_STATUSES } from '@tenda/shared'

/** Which half of the registry a pending disable refers to. */
export type RegistryEntity = 'chain' | 'asset'

/** A registry row the seed would switch off, and what it would strand. */
export interface PendingDisable {
  entity: RegistryEntity
  id: string
  /** Escrows whose funds the contract still holds. */
  unsettled: number
}

/** An enabled asset row, with the chain it belongs to. */
export interface EnabledAsset {
  id: string
  chain_id: string
}

/**
 * Rows the seed would switch off: enabled today, absent from the active config.
 *
 * Plain set difference, shared by both halves so the chain and asset paths
 * cannot drift apart.
 */
export function idsToDisable(
  enabledIds: readonly string[],
  activeIds: readonly string[],
): string[] {
  const active = new Set(activeIds)
  return enabledIds.filter((id) => !active.has(id))
}

/**
 * Assets the seed would switch off, EXCLUDING those on a chain it is retiring
 * anyway.
 *
 * Without that exclusion a single retired chain reports twice — once as the
 * chain, then again as each of its assets — burying the one line an operator
 * actually needs behind noise that all says the same thing. The chain-level
 * entry already covers those escrows.
 */
export function assetsToDisable(
  enabledAssets: readonly EnabledAsset[],
  activeAssetIds: readonly string[],
  chainsBeingDisabled: readonly string[],
): string[] {
  const retiringChains = new Set(chainsBeingDisabled)
  const stillOnALiveChain = enabledAssets.filter((a) => !retiringChains.has(a.chain_id))
  return idsToDisable(
    stillOnALiveChain.map((a) => a.id),
    activeAssetIds,
  )
}

/**
 * Of those candidates, the ones still holding user funds.
 *
 * Takes the candidate list rather than re-deriving it, and that separation is
 * deliberate: `unsettled` falls back to 0 for an id absent from the map, which
 * is FAIL-OPEN — an unqueried row reads as safe to disable. That is only sound
 * while the set counted and the set judged are the same set, so both come from
 * the functions above and there is no second predicate to drift.
 */
export function pendingDisables(
  entity: RegistryEntity,
  candidates: readonly string[],
  unsettledById: ReadonlyMap<string, number>,
): PendingDisable[] {
  return candidates
    .map((id) => ({ entity, id, unsettled: unsettledById.get(id) ?? 0 }))
    .filter((d) => d.unsettled > 0)
}

/**
 * Which override flag acknowledges which kind of disable.
 *
 * Deliberately two flags, not one. A single flag would be set routinely to get
 * past harmless asset changes, and would then already be sitting in the deploy
 * config on the day a chain disable is about to freeze real money.
 */
export const DISABLE_OVERRIDE: Record<RegistryEntity, string> = {
  chain: 'ALLOW_CHAIN_DISABLE',
  asset: 'ALLOW_ASSET_DISABLE',
}

/** What actually happens to the escrows, per kind. Stated separately because it differs. */
const DISABLE_CONSEQUENCE: Record<RegistryEntity, string> = {
  chain:
    'every action on those escrows fails (no adapter is built without the ' +
    "chain's CHAIN_* vars), so the funds are stuck until they are restored",
  asset:
    'existing escrows still settle normally, but NEW escrows on this asset ' +
    'can no longer be created and it disappears from the app',
}

/**
 * The blocked entries whose own flag has NOT been set.
 *
 * Pure and env-injected so the per-entity split is testable: the point of two
 * flags is that ALLOW_CHAIN_DISABLE must NOT clear an asset block, and vice
 * versa, which is exactly what this filter has to get right.
 */
export function unacknowledgedDisables(
  blocked: readonly PendingDisable[],
  env: NodeJS.ProcessEnv,
): PendingDisable[] {
  return blocked.filter((b) => env[DISABLE_OVERRIDE[b.entity]] !== 'true')
}

/** The refusal text, kept next to the check so the two cannot drift. */
export function describeBlockedDisable(blocked: readonly PendingDisable[]): string {
  return (
    'refusing to disable registry entries that still have live escrows:\n' +
    blocked
      .map(
        (b) =>
          `  ${b.entity} ${b.id}: ${b.unsettled} unsettled escrow(s)\n` +
          `    -> ${DISABLE_CONSEQUENCE[b.entity]}\n` +
          `    -> set ${DISABLE_OVERRIDE[b.entity]}=true to retire it deliberately`,
      )
      .join('\n') +
    '\n  This usually means the deploy is missing a CHAIN_* env var — restore it first.'
  )
}

/**
 * Take the strongest row lock on the registry rows about to be switched off.
 *
 * This is what makes the counts trustworthy. Both `escrows.chain_id` and
 * `escrows.asset` are foreign keys, so every escrow INSERT takes a FOR KEY
 * SHARE lock on its chain row and its asset row — and FOR UPDATE conflicts with
 * that. Holding it for the rest of the transaction means no escrow can be
 * committed on a doomed row between counting them and disabling them.
 * (Verified for both: with the lock held an escrow INSERT blocks until timeout;
 * unlocked, the same INSERT succeeds.)
 *
 * Only rows being RETIRED are locked, so escrow creation on everything that
 * survives is untouched — a plain upsert of a live chain takes FOR NO KEY
 * UPDATE, which does not conflict with the FK's lock (also verified).
 */
export async function lockForRetirement(
  db: PostgresJsDatabase,
  chainIds: readonly string[],
  assetIds: readonly string[],
): Promise<void> {
  if (chainIds.length > 0) {
    await db
      .select({ id: chains.id })
      .from(chains)
      .where(inArray(chains.id, [...chainIds]))
      .for('update')
  }
  if (assetIds.length > 0) {
    await db
      .select({ id: assets.id })
      .from(assets)
      .where(inArray(assets.id, [...assetIds]))
      .for('update')
  }
}

async function countUnsettled(
  db: PostgresJsDatabase,
  column: typeof escrows.chain_id | typeof escrows.asset,
  ids: readonly string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ key: column, n: raw<number>`count(*)::int` })
    .from(escrows)
    .where(and(inArray(column, [...ids]), inArray(escrows.status, [...UNSETTLED_ESCROW_STATUSES])))
    .groupBy(column)
  return new Map(rows.map((r) => [r.key, r.n]))
}

/**
 * Everything the seed is about to switch off that still holds user funds.
 *
 * MUST run inside the seed's transaction, before `applySeedRows`: it takes the
 * locks the counts depend on, and checking after the write would mean the
 * damage is already committed.
 */
export async function findBlockedDisables(
  db: PostgresJsDatabase,
  activeChainIds: readonly string[],
  activeAssetIds: readonly string[],
): Promise<PendingDisable[]> {
  const enabledChains = await db
    .select({ id: chains.id })
    .from(chains)
    .where(eq(chains.is_enabled, true))
  const enabledAssets = await db
    .select({ id: assets.id, chain_id: assets.chain_id })
    .from(assets)
    .where(eq(assets.is_enabled, true))

  const chainCandidates = idsToDisable(
    enabledChains.map((r) => r.id),
    activeChainIds,
  )
  const assetCandidates = assetsToDisable(enabledAssets, activeAssetIds, chainCandidates)

  // Lock BEFORE counting: an escrow funded between the count and the disable
  // would otherwise be stranded by a guard that already reported all-clear.
  await lockForRetirement(db, chainCandidates, assetCandidates)

  return [
    ...pendingDisables('chain', chainCandidates, await countUnsettled(db, escrows.chain_id, chainCandidates)),
    ...pendingDisables('asset', assetCandidates, await countUnsettled(db, escrows.asset, assetCandidates)),
  ]
}
