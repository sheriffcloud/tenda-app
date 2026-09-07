/**
 * What "public" means for a gig, in ONE place.
 *
 * NOT a route — a sibling of index.ts, which is the only file @fastify/autoload
 * registers from this directory (see the note atop list-filters.ts).
 *
 * These five conditions decide which rows an anonymous reader may see. They
 * were inline in the feed handler until /v1/gigs/facets needed the same answer:
 * the rail's counts sit beside the list, so any disagreement between the two
 * reads as a bug in the product rather than a difference between two WHERE
 * clauses. Sharing the builder makes agreement structural instead of a thing
 * someone has to remember when they edit one of them.
 *
 * The deadline arm is the one that is easy to get wrong. It is NOT
 * `accept_deadline > now` — a gig may carry no deadline at all, and those are
 * public. Written as the plain comparison, every open-ended gig would vanish
 * from the counts while remaining in the list beside them.
 */
import { eq, gt, isNull, or, type SQL } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'

/**
 * The public gig feed's visibility rule. `now` is a parameter rather than read
 * here so that every query in one request judges the deadline against the SAME
 * instant — two calls a few milliseconds apart could otherwise disagree about
 * a gig expiring between them.
 *
 * Display-correct between expire-escrows ticks: a gig whose accept window has
 * closed is filtered out here even though the job has not yet moved it off
 * 'open'. Taken-down listings (CO1, `hidden`) never surface; their owner still
 * reaches them through `?mine=`.
 */
export function publicGigConditions(now: Date): SQL[] {
  return [
    // Redundant for every caller that exists TODAY — both of them inner-join
    // gig_details, and an exchange escrow has no such row, so the join already
    // excludes it (proved: removing this line fails no test). Kept because this
    // is a SHARED builder: the day something asks "which escrows are publicly
    // visible" without that join, this is the line that keeps the answer to
    // gigs. It states the intent rather than leaning on a join it cannot see.
    eq(escrows.kind, 'gig'),
    eq(escrows.status, 'open'),
    eq(escrows.hidden, false),
    // A direct invite belongs to its named assignee, not to the feed.
    isNull(escrows.assigned_counterparty_id),
    or(isNull(escrows.accept_deadline), gt(escrows.accept_deadline, now)) as SQL,
  ]
}
