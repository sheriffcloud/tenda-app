/**
 * GET /v1/users/:id/completed-work — the categories a user has delivered in
 * and how many times, for the profile's "Work you have done" block.
 *
 * ITS OWN AGGREGATE, for the reason /v1/users/:id/transactions/summary is:
 * "which categories, how many each" cannot be derived from one page of rows,
 * and paging a user's whole history client-side to group it is what this
 * exists to avoid.
 *
 * THE SAME POPULATION AS THE "COMPLETED" STAT BESIDE IT. `mine=working&
 * status=completed` on /v1/gigs is `isEscrowCounterpartySide` + the completed
 * status + kind='gig', and so is this — pushed through the SAME helper rather
 * than a second hand-written `or(...)`, which is exactly the drift
 * lib/escrow-party.ts was written to end. The chips therefore sum to the
 * number printed above them; any other predicate puts two figures that
 * disagree on one page.
 *
 * PUBLIC, deliberately. /v1/users/:id/standing already serves an anonymous
 * caller this user's `completed_count`; a breakdown of the same total is the
 * same disclosure one dimension finer, and it carries no escrow id, no
 * counterparty, no amount and no title. Follows that route's rule while it is
 * here: rolled-up signals only.
 */
import type { FastifyPluginAsync } from 'fastify'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { escrows, gig_details } from '@tenda/shared/db/schema'
import { ErrorCode, isGigCategory } from '@tenda/shared'
import type { ApiError, CompletedWorkCategory, UsersContract } from '@tenda/shared'
import { uuidParamGuard } from '@server/lib/guards'
import { ensureUserExists } from '@server/lib/users'
import { isEscrowCounterpartySide } from '@server/lib/escrow-party'

type CompletedWorkRoute = UsersContract['completedWork']

const COUNT = sql<number>`count(*)::int`

const completedWork: FastifyPluginAsync = async (fastify) => {
  // Malformed `:id` reaches postgres as a uuid comparison and throws;
  // answer it the way an unknown id is already answered.
  fastify.addHook('preHandler', uuidParamGuard('User not found', { code: ErrorCode.USER_NOT_FOUND }))

  fastify.get<{
    Params: CompletedWorkRoute['params']
    Reply: CompletedWorkRoute['response'] | ApiError
  }>('/', async (request) => {
    const { id } = request.params

    // A profile that does not exist is a 404, not an empty block — the block
    // renders nothing for both, and only this distinguishes them.
    await ensureUserExists(fastify.db, id)

    const rows = await fastify.db
      .select({ category: gig_details.category, count: COUNT })
      .from(escrows)
      .innerJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
      .where(
        and(
          // Stated even though the join already implies it, matching what the
          // /v1/gigs `mine` branch does: each query owns its full condition
          // set rather than leaning on a join to mean a filter.
          eq(escrows.kind, 'gig'),
          eq(escrows.status, 'completed'),
          isEscrowCounterpartySide(id),
        ),
      )
      .groupBy(gig_details.category)
      // Most-delivered first, which is the order the chips read in, with a
      // category tiebreaker so the whole clause is a TOTAL order — counts tie
      // constantly at these magnitudes, and a partial ordering leaves the rest
      // to the planner. Measured rather than assumed: dropping the tiebreaker
      // did NOT reshuffle the tied rows on this data, so it is a guarantee
      // being made explicit, not a bug being fixed. The test pins the
      // direction; nothing can pin the absence.
      .orderBy(desc(COUNT), asc(gig_details.category))

    // `gig_details.category` is a `text` column, so a value outside the
    // vocabulary is possible in the type system even though the write path
    // validates. Dropped rather than passed through — the client is keyed by
    // GigCategory and would have no label, icon or tone for it — which is the
    // same choice /v1/gigs/facets makes for an unknown key. A loop rather than
    // filter+map because the guard has to NARROW: `filter` with a boolean
    // predicate leaves the element type alone, so the map would need a cast.
    const data: CompletedWorkCategory[] = []
    for (const row of rows) {
      if (isGigCategory(row.category)) data.push({ category: row.category, count: row.count })
    }

    return { data }
  })
}

export default completedWork
