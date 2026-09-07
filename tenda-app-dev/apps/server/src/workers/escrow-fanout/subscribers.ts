/**
 * New-gig fan-out: when the on-chain create confirms (escrow → open), notify
 * the gig_subscriptions whose city/category match.
 *
 * Runs on its OWN queue ('fanout-subscribers'), not inline in the verify-tx
 * republish — see the 'fanout-subscribers' note in plugins/queue/payloads.ts
 * for why. What that buys beyond the freed slot: this work now gets BullMQ's
 * retry posture. Inline, a failure part-way through was swallowed by verify-tx's
 * best-effort republish catch — whoever had already been enqueued kept their
 * notice and everyone after the failure point silently never heard about the
 * gig, with nothing left to retry. As a job it is retried, which is what the
 * stable ids below are for.
 *
 * The matching is SQL, not application code, which is why it is covered by an
 * integration test rather than a fake store — a stub would assert the query we
 * wrote, not the rows postgres returns.
 */

import { and, asc, eq, gt, ne, or } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { gig_subscriptions } from '@tenda/shared/db/schema'
import { escrows, gig_details } from '@tenda/shared/db/schema/escrow'
import { stableNotificationId } from '@server/lib/notify'
import { newGigNotice } from './copy'
import { enqueueEscrowNotice } from './enqueue-notice'

/**
 * Recipients per round trip — the size of both the SELECT page and the enqueue
 * batch, deliberately the same number so one page is one batch and neither has
 * to be re-chunked to feed the other.
 *
 * Exported so the test that proves paging happens at all can seed
 * `PAGE + 1` subscribers without hard-coding a number that would quietly stop
 * testing paging the moment this changed.
 */
export const SUBSCRIBER_PAGE_SIZE = 500

/**
 * Hash namespace for this fan-out's notification ids, so a new-gig notice and
 * any other notice about the same (escrow, user) pair cannot collide on one
 * primary key and silently drop each other.
 */
const FANOUT_ID_NAMESPACE = 'gig-fanout'

export async function fanOutNewGigToSubscribers(
  fastify: FastifyInstance,
  escrow_id: string,
): Promise<void> {
  const [gig] = await fastify.db
    .select({
      creator_id: escrows.creator_id,
      title: gig_details.title,
      city: gig_details.city,
      category: gig_details.category,
    })
    .from(escrows)
    .innerJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
    .where(and(eq(escrows.id, escrow_id), eq(escrows.kind, 'gig')))
    .limit(1)
  // Exchange escrows have no gig_details row, nothing to fan out.
  if (gig === undefined) return

  // Built once for every page: the copy depends on the gig, not the recipient.
  const notice = newGigNotice(gig.title, gig.city)

  // Remote gigs match wildcard-city subscribers only; local gigs match
  // city + wildcard ('*' = any-value sentinel). Category filtered the same way.
  //
  // Deduping and dropping the poster are SQL now, where they used to be a `Set`
  // and a `.filter` over the materialised result. Same answer — `DISTINCT` over
  // one column is what the Set was doing by hand — but the rows never leave
  // postgres, which is what makes the paging below bounded: a user holding four
  // matching subscriptions can no longer take four slots of a page.
  const match = and(
    gig.city === null
      ? eq(gig_subscriptions.city, '*')
      : or(eq(gig_subscriptions.city, gig.city), eq(gig_subscriptions.city, '*')),
    or(eq(gig_subscriptions.category, gig.category), eq(gig_subscriptions.category, '*')),
    ne(gig_subscriptions.user_id, gig.creator_id),
  )

  // KEYSET paging, not OFFSET: offset re-walks and discards every row already
  // sent, so the last page of a popular gig costs the most. Ordering by the same
  // column `DISTINCT` dedups on means each page resumes exactly where the last
  // ended, and strictly-increasing `user_id` guarantees the loop terminates.
  //
  // Several statements, so this is NOT one snapshot: someone who subscribes
  // mid-expansion is included if their id sorts after the cursor and missed if
  // it sorts before. Accepted rather than wrapped in a transaction — holding one
  // open across a fan-out to buy a subscriber a notice about a gig posted
  // moments before they subscribed is the wrong trade.
  let after: string | null = null
  for (;;) {
    const page = await fastify.db
      .selectDistinct({ user_id: gig_subscriptions.user_id })
      .from(gig_subscriptions)
      // `and` drops undefined, so the first page carries no keyset predicate.
      .where(and(match, after === null ? undefined : gt(gig_subscriptions.user_id, after)))
      .orderBy(asc(gig_subscriptions.user_id))
      .limit(SUBSCRIBER_PAGE_SIZE)

    if (page.length === 0) return

    await enqueueEscrowNotice(
      fastify.queue,
      escrow_id,
      'gig',
      page.map((s) => s.user_id),
      notice,
      // Idempotent per (gig, recipient). This job is RETRIED, which the inline
      // version never was, so a failure part-way through a large expansion
      // replays every page before it — and a replayed page must not give
      // everyone on it a second row in their notification centre.
      //
      // It does NOT de-duplicate the push: the delivery worker pushes whether
      // or not the insert conflicted, so a retry re-pushes every page that had
      // already succeeded. That is a real remaining gap — see #45 — and it is
      // the transient half. The persisted rows are the half that would
      // otherwise accumulate in the notification centre for good.
      (user_id) => stableNotificationId(FANOUT_ID_NAMESPACE, escrow_id, user_id),
    )

    // A short page is the last page. Checked AFTER enqueueing so a gig with
    // exactly one page still sends it, and checked rather than looping until an
    // empty page so the common case costs one query, not two.
    if (page.length < SUBSCRIBER_PAGE_SIZE) return
    after = page[page.length - 1].user_id
  }
}
