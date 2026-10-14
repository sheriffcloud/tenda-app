/**
 * What "public" means for an exchange offer, in ONE place (#179).
 *
 * NOT a route — a sibling of index.ts, which is the only file @fastify/autoload
 * registers from this directory. The gigs directory has three such siblings for
 * the same reason.
 *
 * This exists because the book stopped being a signed-in surface. While it sat
 * behind `authenticate`, "which rows does the feed show" was a detail of one
 * handler; anonymous, it is the definition of what the product publishes, and a
 * definition belongs somewhere a reader can find it.
 *
 * DELIBERATELY the same shape as `routes/v1/gigs/public-feed.ts`, including its
 * two traps:
 *   - the deadline arm is NOT `accept_deadline > now`. An offer may carry no
 *     deadline at all and those are public; written as the plain comparison,
 *     every open-ended offer would vanish.
 *   - `now` is a PARAMETER, not read here, so every query in one request judges
 *     the deadline against the same instant. Two calls milliseconds apart could
 *     otherwise disagree about an offer expiring between them — and the book
 *     and its `total` are exactly two such calls.
 */
import { eq, gt, isNull, or, type SQL } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'

/**
 * The public order book's visibility rule.
 *
 * Display-correct between expire-escrows ticks: an offer whose accept window
 * has closed is filtered out here even though the job has not yet moved it off
 * 'open'. Taken-down offers (CO1, `hidden`) never surface; their creator still
 * reaches them through their own escrow list.
 *
 * THE DIRECT-INVITE ARM IS NEW HERE, and it is a behaviour change worth stating
 * rather than burying. `assigned_counterparty_id` carries no kind restriction at
 * create, so a direct-invite EXCHANGE offer is a reachable state — and until
 * #179 the book listed it to every signed-in reader, none of whom could accept
 * it (only the assignee can; the server 403s everyone else). That was already
 * wrong: it is the very case `scopeEscrowAcceptanceMode` exists to warn a client
 * about. Publishing it anonymously would have made a private invitation a public
 * document. The gig feed has always excluded these; the book now agrees.
 *
 * The invitee is not cut off — they reach the offer by its id, where the detail
 * route still reports `is_assigned` and `assigned_counterparty_id` to them.
 */
export function publicExchangeConditions(now: Date): SQL[] {
  return [
    // Not redundant the way the gig builder's `kind` line is: both callers here
    // inner-join `exchange_details`, which an escrow of any kind could in
    // principle carry — the join does not answer "is this an exchange" on its
    // own the way `gig_details` does for the other feed. States the intent and
    // narrows the rows.
    eq(escrows.kind, 'exchange'),
    eq(escrows.status, 'open'),
    eq(escrows.hidden, false),
    // A direct invite belongs to its named assignee, not to the book.
    isNull(escrows.assigned_counterparty_id),
    or(isNull(escrows.accept_deadline), gt(escrows.accept_deadline, now)) as SQL,
  ]
}
