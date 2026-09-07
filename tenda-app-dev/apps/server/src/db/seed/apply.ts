/**
 * Seed row APPLIER — the I/O half of the seed. Registry FACTS (chain/asset
 * rows) upsert so a redeploy or manifest change propagates on re-run;
 * operator-tunable rows (platform_config, fiat_providers) stay
 * `ON CONFLICT DO NOTHING` so re-seeding never clobbers admin edits.
 *
 * The row builder lives in ./rows.
 */

import { inArray, sql } from 'drizzle-orm'
import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { assets, chain_contracts, chains } from '@tenda/shared/db/schema/chains'
import { fiat_providers } from '@tenda/shared/db/schema/fiat'
import { platform_config } from '@tenda/shared/db/schema/governance'
import { type SeedRows } from './rows'

/** Rows whose `is_enabled` disagrees with the active config, in both directions. */
export interface EnablementDelta {
  toEnable: string[]
  toDisable: string[]
}

/**
 * Which stored rows actually need their `is_enabled` flipped.
 *
 * Pure, so the "no diff → no write" property is testable without a database —
 * that property is the whole point, and a blanket UPDATE would satisfy every
 * end-state assertion while quietly reintroducing the churn.
 *
 * Ids in `activeIds` with no stored row are absent from both lists on purpose:
 * the upsert has already inserted them, enabled by default.
 */
export function enablementDelta(
  stored: ReadonlyArray<{ id: string; is_enabled: boolean }>,
  activeIds: readonly string[],
): EnablementDelta {
  const active = new Set(activeIds)
  const toEnable: string[] = []
  const toDisable: string[] = []
  for (const row of stored) {
    const shouldBeEnabled = active.has(row.id)
    if (shouldBeEnabled && !row.is_enabled) toEnable.push(row.id)
    else if (!shouldBeEnabled && row.is_enabled) toDisable.push(row.id)
  }
  return { toEnable, toDisable }
}

/**
 * Apply seed rows to a database, in ONE transaction.
 *
 * The transaction matters more than it looks. `chains` is written before
 * `assets`, so a partial apply leaves chains matching config while assets are
 * still stale — and that is precisely the state `assertChainRegistryInSync`
 * cannot see. Its whole premise is "chains agree with config, therefore the
 * seed ran, therefore assets are current"; a half-applied seed makes that
 * inference false and lets a stale `assets.token_address` be served as though
 * it were verified. Under SEED_ON_BOOT this runs on every container start, so
 * "it fails midway" stops being hypothetical. (Verified by probe: with the
 * transaction a failing asset write rolls the chains write back; without it,
 * chains commits and assets does not.)
 *
 * Callers that need extra work in the SAME transaction (boot-seed runs its
 * live-escrow guard there) open the transaction themselves and call
 * `applySeedRows` directly.
 *
 * Generic over the schema typing so a caller holding a schema-aware handle
 * (`AppDatabase`) can seed as readily as the seeder's own bare connection. This
 * function only touches tables it imports itself, so the caller's schema
 * parameter is irrelevant to it — pinning it merely made the seed un-callable
 * from one of the two, for no reason.
 */
export async function applySeed<S extends Record<string, unknown>>(
  db: PostgresJsDatabase<S>,
  rows: SeedRows,
): Promise<void> {
  await db.transaction(async (tx) => {
    await applySeedRows(tx, rows)
  })
}

/** The statements themselves. MUST be called inside a transaction. */
export async function applySeedRows<S extends Record<string, unknown>>(
  db: PostgresJsDatabase<S>,
  rows: SeedRows,
): Promise<void> {
  // Registry facts follow config: a contract redeploy or manifest change must
  // land on re-seed (a DO NOTHING here once stranded a stale escrow address
  // after the Base Sepolia redeploy). `is_enabled` is deliberately NOT in the
  // update set, the reconcile below owns it.
  await db.insert(chains).values(rows.chains).onConflictDoUpdate({
    target: chains.id,
    set: {
      namespace: sql`excluded.namespace`,
      display_name: sql`excluded.display_name`,
      min_confirmations: sql`excluded.min_confirmations`,
      treasury_address: sql`excluded.treasury_address`,
      escrow_program: sql`excluded.escrow_program`,
      gas_seed_amount_raw: sql`excluded.gas_seed_amount_raw`,
      gas_seed_wallet_address: sql`excluded.gas_seed_wallet_address`,
    },
  })
  // Escrow-contract HISTORY. `DO NOTHING` here is the exact inverse of the
  // `chains` upsert above and deliberately so: that row is current state and
  // must follow config, these rows are a ledger of every contract the chain has
  // ever run and must never be rewritten. A redeploy therefore appends — the new
  // address arrives, the superseded one stays — which is what keeps escrows
  // still funded by the old contract transactable (open_issues #89).
  //
  // Runs AFTER the `chains` upsert because of the FK, and inside the same
  // transaction, so a chain and its contract history can never half-commit.
  await db
    .insert(chain_contracts)
    .values(rows.chain_contracts)
    .onConflictDoNothing({ target: [chain_contracts.chain_id, chain_contracts.address] })
  await db.insert(assets).values(rows.assets).onConflictDoUpdate({
    target: assets.id,
    set: {
      chain_id: sql`excluded.chain_id`,
      symbol: sql`excluded.symbol`,
      decimals: sql`excluded.decimals`,
      token_address: sql`excluded.token_address`,
      is_stable: sql`excluded.is_stable`,
    },
  })
  await db.insert(platform_config).values({ id: 1 }).onConflictDoNothing({
    target: platform_config.id,
  })
  await db
    .insert(fiat_providers)
    .values(rows.fiat_providers)
    .onConflictDoNothing({ target: fiat_providers.id })

  // Reconcile enablement so the registry reflects EXACTLY the active config
  // (one chain per family). The seed never deletes, so a chain/asset from a
  // prior env (e.g. a switched-out Solana cluster) would otherwise linger
  // enabled and get served by /v1/platform/chains, surfacing as a duplicate
  // row on the wallet screen. Enable the active set, disable everything else.
  //
  // Only the rows that actually need flipping are written. Same end state as
  // four blanket UPDATEs, and that mattered little while this was a hand-run
  // command — but SEED_ON_BOOT calls it on every container start, where
  // rewriting `is_enabled = true` over an already-true row costs a dead tuple
  // per row per boot, and, worse, lets a rolling deploy flap: old and new
  // replicas hold different envs, disagree on the active set, and take turns
  // flipping the same rows while clients poll /v1/platform/chains. No diff, no
  // write, no flap.
  //
  // Read AFTER the upserts above, so rows just inserted (is_enabled defaults
  // true, and the conflict target deliberately excludes it) are already
  // reflected here and produce no delta.
  const storedChains = await db
    .select({ id: chains.id, is_enabled: chains.is_enabled })
    .from(chains)
  const storedAssets = await db
    .select({ id: assets.id, is_enabled: assets.is_enabled })
    .from(assets)

  const chainDelta = enablementDelta(storedChains, rows.chains.map((c) => c.id))
  const assetDelta = enablementDelta(storedAssets, rows.assets.map((a) => a.id))

  if (chainDelta.toEnable.length > 0) {
    await db.update(chains).set({ is_enabled: true }).where(inArray(chains.id, chainDelta.toEnable))
  }
  if (chainDelta.toDisable.length > 0) {
    await db.update(chains).set({ is_enabled: false }).where(inArray(chains.id, chainDelta.toDisable))
  }
  if (assetDelta.toEnable.length > 0) {
    await db.update(assets).set({ is_enabled: true }).where(inArray(assets.id, assetDelta.toEnable))
  }
  if (assetDelta.toDisable.length > 0) {
    await db.update(assets).set({ is_enabled: false }).where(inArray(assets.id, assetDelta.toDisable))
  }
}
