/**
 * CO8 featured rail, admin-curated, scheduled placements served separately
 * from the feed (GET /v1/gigs/featured). Single in-process cache (same
 * pattern as lib/platform.ts); admin CRUD invalidates so curation shows
 * immediately on the curating pod, and the short TTL bounds staleness on
 * the others.
 */
import { and, asc, eq, gt, gte, isNull, lte, or, type SQL } from 'drizzle-orm'
import { escrows, gig_details, users, featured_slots } from '@tenda/shared/db/schema'
import type { GigSummary } from '@tenda/shared'
import { GIG_SUMMARY_COLS, toGigSummary } from '@server/lib/gig-read'
import type { AppDatabase } from '@server/plugins/db'

/** Rail size cap, a carousel, not a second feed. */
export const FEATURED_RAIL_LIMIT = 10

const CACHE_TTL_MS = 60_000

let cache: GigSummary[] | null = null
let cacheExpiry = 0

/** Call after any featured_slots mutation. */
export function invalidateFeaturedCache(): void {
  cache = null
  cacheExpiry = 0
}

/**
 * Active-window slots joined to their listings, position-ordered and
 * deduped (a listing may hold overlapping slots). Only LIVE listings
 * surface: open, not taken down, accept window still open, a slot whose
 * gig got accepted or hidden silently drops out of the rail.
 */
export async function getFeaturedGigs(db: AppDatabase): Promise<GigSummary[]> {
  const now = Date.now()
  if (cache !== null && now < cacheExpiry) return cache

  const at = new Date(now)
  const rows = await db
    .select({ ...GIG_SUMMARY_COLS, slot_position: featured_slots.position })
    .from(featured_slots)
    .innerJoin(escrows, eq(escrows.id, featured_slots.escrow_id))
    .innerJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
    .innerJoin(users, eq(users.id, escrows.creator_id))
    .where(
      and(
        lte(featured_slots.starts_at, at),
        gte(featured_slots.ends_at, at),
        eq(escrows.status, 'open'),
        eq(escrows.hidden, false),
        or(isNull(escrows.accept_deadline), gt(escrows.accept_deadline, at)) as SQL,
      ),
    )
    .orderBy(asc(featured_slots.position), asc(featured_slots.starts_at))
    .limit(FEATURED_RAIL_LIMIT * 2) // headroom for duplicate-slot dedupe

  const seen = new Set<string>()
  const rail: GigSummary[] = []
  for (const { slot_position: _slot_position, ...row } of rows) {
    if (seen.has(row.escrow_id)) continue
    seen.add(row.escrow_id)
    rail.push(toGigSummary(row))
    if (rail.length >= FEATURED_RAIL_LIMIT) break
  }

  cache = rail
  cacheExpiry = now + CACHE_TTL_MS
  return rail
}
