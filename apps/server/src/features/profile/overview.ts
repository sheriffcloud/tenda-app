/**
 * The dashboard's database facts in one read (#17) — `GET /v1/users/me/overview`.
 *
 * Every count uses the predicate its list route filters by, so a figure here
 * and the `total` of the list it summarises are the same number: gigs by
 * `isEscrowCounterpartySide` / creator over `escrows ⨝ gig_details` (as
 * /v1/gigs?mine=), disputes via `myDisputeConditions` (as /v1/disputes), and
 * reviews by `reviewee_id` (as /v1/users/:id/reviews). Counts are run in one
 * Promise.all; none depends on another.
 */
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { disputes, escrows, gig_details, reviews } from '@tenda/shared/db/schema'
import { ACTIVE_ESCROW_STATUSES, POSTED_ESCROW_STATUSES } from '@tenda/shared'
import type { MyOverviewResponse } from '@tenda/shared'
import { myDisputeConditions } from '@server/features/disputes/my-disputes'
import { isEscrowCounterpartySide } from '@server/lib/escrow/party'
import type { AppDatabase } from '@server/plugins/db'

export async function readMyOverview(db: AppDatabase, userId: string): Promise<MyOverviewResponse> {
  const gigCount = async (side: SQL, statuses: readonly (typeof POSTED_ESCROW_STATUSES)[number][]) => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(escrows)
      .innerJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
      .where(and(eq(escrows.kind, 'gig'), side, inArray(escrows.status, [...statuses])))
    return row?.count ?? 0
  }
  const created = eq(escrows.creator_id, userId)
  const worked = isEscrowCounterpartySide(userId)

  const [posted, active, completed, [reviewRow], [disputeRow]] = await Promise.all([
    gigCount(created, POSTED_ESCROW_STATUSES),
    gigCount(created, ACTIVE_ESCROW_STATUSES),
    gigCount(worked, ['completed']),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(eq(reviews.reviewee_id, userId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(disputes)
      .innerJoin(escrows, eq(disputes.escrow_id, escrows.id))
      .where(myDisputeConditions(userId, 'open')),
  ])

  return {
    stats: { posted, active, completed, reviews: reviewRow?.count ?? 0 },
    open_disputes: disputeRow?.count ?? 0,
  }
}
