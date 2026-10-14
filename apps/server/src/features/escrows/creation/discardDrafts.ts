/**
 * Discarding UNFUNDED drafts, in one place.
 *
 * Two callers delete drafts without a person asking: the demo account's ring
 * (features/agent/demo/demoDraftRing) and the retention sweep for abandoned ones
 * (./staleDrafts). Both must apply the guards `DELETE /v1/escrows/:id` applies
 * before a person discards one, and two spellings of those guards is how one of
 * them would stop protecting a create that is already on its way to the chain.
 */
import { and, eq, inArray, notExists } from 'drizzle-orm'
import { escrows, tx_attempts } from '@tenda/shared/db/schema'
import type { AppDatabase } from '@server/plugins/db'
import { pendingCreateAttempt } from './hasPendingEscrowCreateTransaction'

/**
 * A draft whose create is awaiting confirmation is not abandoned; it is never
 * rung out. The clauses are the discard route's own (`pendingCreateAttempt`),
 * correlated on the escrow column so one SELECT answers for every draft.
 */
export function noCreateInFlight(db: AppDatabase) {
  return notExists(db.select({ id: tx_attempts.id }).from(tx_attempts).where(pendingCreateAttempt(escrows.id)))
}

/**
 * Delete the chosen drafts, RE-ASSERTING both conditions that chose them.
 *
 * Selecting and deleting are two statements, so everything the selection
 * checked can change in between — and on the demo account it can, because the
 * account is SHARED: one caller's resend records its create attempt while
 * another caller's ring is mid-turn. Both guards therefore appear twice.
 *
 * `status` was always re-checked (a create confirming here moves the row
 * draft → open, and a live escrow must not be erased). `noCreateInFlight` was
 * NOT, which left the wider hole of the two: an in-flight create leaves the row
 * at 'draft', so the status guard does not cover it, and deleting there orphans
 * an escrow the relayer has already broadcast and paid gas for — cascading away
 * the very tx_attempts row that verify-tx would have applied.
 *
 * Split out so the window itself is testable: a caller hands the ids the
 * selection picked, which IS the state the race produces.
 */
export async function discardDrafts(db: AppDatabase, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0
  const deleted = await db
    .delete(escrows)
    .where(and(inArray(escrows.id, [...ids]), eq(escrows.status, 'draft'), noCreateInFlight(db)))
    .returning({ id: escrows.id })
  return deleted.length
}
