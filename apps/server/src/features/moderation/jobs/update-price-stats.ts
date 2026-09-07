/**
 * Nightly category_price_stats rollup (stage-6-moderation.md): percentile
 * RAW amounts from completed gig escrows per (category, country, asset).
 * Grounds the price-sanity prompts; minSampleSize keeps thin groups from
 * gating anyone. Scheduled as the nightly 'update-price-stats' repeatable
 * (plugins/workers.ts REPEATABLES; processor wired in workers/processors.ts).
 */

import { and, eq, sql } from 'drizzle-orm'
import { escrows, gig_details } from '@tenda/shared/db/schema/escrow'
import { category_price_stats } from '@tenda/shared/db/schema/moderation'
import type { AppDatabase } from '@server/plugins/db'

// ---------- pure percentile math (tested directly) ----------------------------

/**
 * Nearest-rank percentile over RAW amounts (bigint-safe via string sort on
 * normalized values is unsafe, we parse to BigInt and sort numerically).
 */
export function rawPercentile(sorted: ReadonlyArray<bigint>, p: number): bigint {
  if (sorted.length === 0) throw new Error('rawPercentile: empty input')
  const rank = Math.ceil((p / 100) * sorted.length)
  const idx = Math.min(Math.max(rank - 1, 0), sorted.length - 1)
  return sorted[idx]
}

export interface PriceGroup {
  category: string
  country: string
  asset: string
  amounts_raw: string[]
}

export interface PriceStatsRow {
  category: string
  country: string
  asset: string
  p10_amount_raw: string
  p50_amount_raw: string
  p90_amount_raw: string
  sample_size: number
}

export function rollupGroup(group: PriceGroup): PriceStatsRow {
  const sorted = group.amounts_raw.map((a) => BigInt(a)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return {
    category: group.category,
    country: group.country,
    asset: group.asset,
    p10_amount_raw: rawPercentile(sorted, 10).toString(),
    p50_amount_raw: rawPercentile(sorted, 50).toString(),
    p90_amount_raw: rawPercentile(sorted, 90).toString(),
    sample_size: sorted.length,
  }
}

// ---------- store seam + handler ------------------------------------------------

export interface PriceStatsStore {
  /** Completed gig amounts grouped by (category, country, asset). */
  findCompletedGigGroups(): Promise<PriceGroup[]>
  upsertStats(row: PriceStatsRow): Promise<void>
}

export function drizzlePriceStatsStore(db: AppDatabase): PriceStatsStore {
  return {
    async findCompletedGigGroups() {
      const rows = await db
        .select({
          category: gig_details.category,
          country: gig_details.country,
          asset: escrows.asset,
          amounts: sql<string[]>`array_agg(${escrows.amount_raw}::text)`,
        })
        .from(escrows)
        .innerJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
        .where(and(eq(escrows.kind, 'gig'), eq(escrows.status, 'completed')))
        .groupBy(gig_details.category, gig_details.country, escrows.asset)
      return rows.flatMap((r) =>
        r.country === null
          ? []
          : [{ category: r.category, country: r.country, asset: r.asset, amounts_raw: r.amounts }],
      )
    },
    async upsertStats(row) {
      await db
        .insert(category_price_stats)
        .values({ ...row, updated_at: new Date() })
        .onConflictDoUpdate({
          target: [
            category_price_stats.category,
            category_price_stats.country,
            category_price_stats.asset,
          ],
          set: {
            p10_amount_raw: row.p10_amount_raw,
            p50_amount_raw: row.p50_amount_raw,
            p90_amount_raw: row.p90_amount_raw,
            sample_size: row.sample_size,
            updated_at: new Date(),
          },
        })
    },
  }
}

export async function updatePriceStatsHandler(deps: {
  store: PriceStatsStore
  log: { info(obj: Record<string, unknown>, msg: string): void }
}): Promise<{ groups: number }> {
  const groups = await deps.store.findCompletedGigGroups()
  for (const group of groups) {
    if (group.amounts_raw.length === 0) continue
    await deps.store.upsertStats(rollupGroup(group))
  }
  deps.log.info({ groups: groups.length }, 'price-stats rollup complete')
  return { groups: groups.length }
}
