/**
 * Abandoned drafts: the retention sweep's selection.
 *
 * A draft (gig or exchange, human or agent) is minted before anything is funded,
 * and nothing else ever removes one a person walks away from: expire, sweep and
 * reconcile act on funded escrows and pending attempts. This discards the ones
 * that have sat IDLE for `DRAFT_RETENTION_DAYS`, and ONLY the ones the demo ring and
 * the discard route could also discard — still a draft, and no create awaiting
 * confirmation (`./discardDrafts` holds those guards and re-asserts them inside
 * the DELETE). `gig_details` and the other satellites go with the row through
 * their `ON DELETE CASCADE`.
 */
import { and, asc, eq, lt } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import type { AppDatabase } from '@server/plugins/db'
import { discardDrafts, noCreateInFlight } from './discardDrafts'

/** How long an unfunded draft lives before the sweep may discard it. */
export const DRAFT_RETENTION_DAYS_DEFAULT = 7

/**
 * Discard up to `limit` drafts last touched before `older_than`, longest-idle
 * first. Strictly before: a draft touched exactly at the cutoff is kept. Answers
 * how many went, for the caller's log.
 *
 * Idle time, not age: `updated_at` moves when the owner comes back to a draft
 * (a replayed create, a re-prepared one), so a draft someone is still working
 * towards publishing is not deleted for the day it was first made. Only a writer
 * acting on the owner's behalf moves it. Nothing in the background touches a
 * draft row; the admin hide toggle does, and an admin acting on a draft is
 * activity.
 */
export async function discardStaleDrafts(
  db: AppDatabase,
  args: { older_than: Date; limit: number },
): Promise<number> {
  const stale = await db
    .select({ id: escrows.id })
    .from(escrows)
    .where(and(eq(escrows.status, 'draft'), lt(escrows.updated_at, args.older_than), noCreateInFlight(db)))
    .orderBy(asc(escrows.updated_at), asc(escrows.id))
    .limit(args.limit)
  return discardDrafts(db, stale.map((row) => row.id))
}
