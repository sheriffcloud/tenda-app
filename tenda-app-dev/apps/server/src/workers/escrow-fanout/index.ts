/**
 * Escrow-event push/WS fan-out. MOVED here out of workers/processors.ts — not
 * copied — to keep that file under the size budget and to unit-test the copy in
 * isolation. Nothing of it remains there: processors.ts builds the deps and
 * calls `fanOutEscrowEvent`, and this module owns the description of what it
 * does, so there is one place to update when a step is added.
 *
 * verify-tx republish (stage-2 § listener step 5) calls fanOutEscrowEvent. Its
 * steps, numbered as they are in the body — this list had drifted to three
 * entries while the body had five, which is the failure the paragraph above
 * promises not to have:
 *   1. WS: an `escrow:<id>` frame the TransactionMonitor subscribes to (#42).
 *   2. Alerts: an operational alert for the events an OPERATOR must act on.
 *   3. On `escrow.created`, hand the new-gig subscriber expansion to the
 *      'fanout-subscribers' queue and return. Enqueued, never expanded here —
 *      the expansion is unbounded and this runs on a scarce verify-tx slot.
 *   4. Applicants the transition moved without them acting (assign settles
 *      rivals, unassign revives them), from ids the applier returned.
 *   5. Push: a 'notifications' job to the party who must LEARN of the event
 *      (the non-actor), resolved from the escrow row.
 *
 * Steps 2 and 5 have different audiences and are deliberately independent:
 * features/alerts reaches whoever holds a permission (a mediator), this
 * module's own copy reaches the parties to the escrow. Neither is the other's
 * fallback, and neither may cost the other its delivery.
 *
 * Split into ./copy (the kind-aware wording matrix), ./subscribers (the
 * new-gig SQL fan-out, now driven by its own queue rather than by step 3) and
 * ./enqueue-notice (the single delivery loop), with the orchestrator here.
 * Barrel keeps the `@server/workers/escrow-fanout` import surface stable.
 */

import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { escrows } from '@tenda/shared/db/schema/escrow'
import { channelName } from '@server/lib/ws'
import { alertRefForEscrowEvent, enqueueAlert } from '@server/features/alerts'
import type { EscrowRepublishEvent } from '@server/lib/escrow-events'
import { APPLICANT_NOTICE, noticeCopyFor, partyNoticeFor } from './copy'
import { enqueueEscrowNotice } from './enqueue-notice'
import { publishGigFeedChange, type GigFeedChange } from '@server/features/gig-feed-realtime'

// Named rather than `export *`: `export type` marks what is erased and
// `export` what survives to runtime, and no __exportStar loop is emitted.
//
// The subscriber expansion is re-exported but NOT called from this file any
// more: step 3 below enqueues it, and workers/processors.ts binds it to the
// 'fanout-subscribers' queue. The barrel stays its one import surface so that
// move did not change how anything reaches it.
export { fanOutNewGigToSubscribers, SUBSCRIBER_PAGE_SIZE } from './subscribers'
export {
  partyNoticeFor,
  noticeCopyFor,
  escrowNoticeFor,
  newGigNotice,
  APPLICANT_NOTICE,
} from './copy'
export type { NoticeCopy, EventNotice, ResolvedNotice } from './copy'

/**
 * The republish payload. Owned by lib/escrow-events so this consumer and
 * verify-tx (the producer) share one declaration instead of two hand-kept
 * copies — re-exported here because every caller of this module already
 * imports the name from it.
 */
export type EscrowFanoutEvent = EscrowRepublishEvent

const GIG_FEED_CHANGE_BY_EVENT: Record<EscrowFanoutEvent['internal_event'], GigFeedChange | null> = {
  'escrow.created': 'available',
  'escrow.accepted': 'accepted',
  'escrow.declined': 'available',
  'escrow.counterparty_assigned': 'assigned',
  'escrow.assignment_released': 'available',
  'escrow.proof_submitted': null,
  'escrow.approved': null,
  'escrow.payment_claimed': null,
  'escrow.cancelled': 'cancelled',
  'escrow.expired': 'expired',
  'escrow.abandoned': null,
  'escrow.dispute_raised': null,
  'escrow.dispute_resolved': null,
}

export async function fanOutEscrowEvent(
  fastify: FastifyInstance,
  event: EscrowFanoutEvent,
): Promise<void> {
  // 1. Live WS frame, matches shared EscrowEventFrame exactly.
  fastify.realtime.publish({
    channel: channelName({ kind: 'escrow', id: event.escrow_id }),
    type: 'escrow_event',
    escrow_id: event.escrow_id,
    event: event.wire_event,
    tx_ref: event.tx_ref,
  })
  const feedChange = GIG_FEED_CHANGE_BY_EVENT[event.internal_event]
  if (feedChange !== null) await publishGigFeedChange(fastify, event.escrow_id, feedChange)

  // 2. Operational alerts, for the events a MEDIATOR must act on.
  //
  //    Placed here, above every early return below, because which events raise
  //    an alert is `ALERT_REF_BY_EVENT`'s decision and not this function's
  //    routing. Hooked further down, `escrow.created` would be unalertable (it
  //    returns at step 3) and so would every event with no party copy (step 5
  //    returns when `partyNoticeFor` is null) — a future alert kind would land
  //    on one of those and go silently undelivered.
  //
  //    Deliberately NOT wrapped in try/catch: `enqueueAlert` never throws (G5,
  //    documented at features/alerts/enqueue-alert.ts), so a catch here would
  //    be dead code that reads as a live guarantee. The direction that matters
  //    is the other one — the party notices below must not be lost because an
  //    operator's alert failed — and that is what G5 buys.
  //
  //    Awaited rather than fired and forgotten, and NOT because of an unhandled
  //    rejection — G5 means there is none. Because this runs inside a BullMQ
  //    job: a floating promise lets the job be reported complete while the
  //    alert is still in flight to Redis, so a deploy or a crash in that window
  //    loses it with nothing left to retry. `no-floating-promises` needs
  //    type-aware linting, which this package does not enable yet, so the guard
  //    is a test (test/integration/alerts-fanout.test.ts).
  const alert = alertRefForEscrowEvent(event)
  if (alert !== null) await enqueueAlert(fastify.queue, alert, fastify.log)

  // 3. New-gig subscriber fan-out (created = went live; the actor needs no
  //    notice, subscribers do).
  //
  //    HANDED OFF rather than done here. This function runs inside the verify-tx
  //    job, which has 8 worker slots for the whole app; the expansion is
  //    unbounded in the subscriber count, so doing it here held one of those
  //    slots for its full duration and queued transaction verification behind a
  //    popular gig. Enqueueing is one round trip regardless of how many
  //    subscribers there turn out to be.
  //
  //    No `job_id`: a dedup key would be pointless and harmful here. Pointless
  //    because the caller already dedups — verify-tx republishes only when the
  //    transition APPLIED, and its step-1 `isProcessed` check means a retried
  //    job returns before republishing. Harmful because BullMQ keeps a failed
  //    job under its id (removeOnFail retains up to 7 days or 5,000 failures,
  //    whichever binds first), so a keyed expansion that exhausted its retries
  //    would silently swallow a later re-enqueue for as long as it is retained.
  if (event.internal_event === 'escrow.created') {
    await fastify.queue.enqueue('fanout-subscribers', { escrow_id: event.escrow_id })
    return
  }

  // 4. Applicants the transition moved without them acting: D4's losers on an
  //    assign, and the rivals an unassign puts back in the running. They get
  //    no other signal — their row simply changes status — so this is the only
  //    place either decision reaches them. Runs before the notice lookup
  //    because it is independent of whether the event has party copy at all.
  //    The two lists are disjoint by construction (one event settles, the
  //    other revives), so nobody receives both for one transition.
  //
  //    The ids come from the applier rather than a fresh query on purpose:
  //    once the commit lands, rows this transition settled look identical to
  //    rows an earlier assign/unassign cycle settled, so re-reading would
  //    notify the same people again every time the poster cycles a worker.
  //    Gig-only by construction — the apply route refuses a non-gig escrow.
  const { escrow_id } = event
  await enqueueEscrowNotice(fastify.queue, escrow_id, 'gig', event.passed_applicant_ids, APPLICANT_NOTICE.passed)
  await enqueueEscrowNotice(fastify.queue, escrow_id, 'gig', event.revived_applicant_ids, APPLICANT_NOTICE.revived)

  // 5. Push fan-out for high-signal events — kind decides both copy + routing.
  //    Looked up before the read so a non-notifying event costs no query.
  const notice = partyNoticeFor(event.internal_event)
  if (notice === null) return

  const [row] = await fastify.db
    .select({
      creator_id: escrows.creator_id,
      counterparty_id: escrows.counterparty_id,
      kind: escrows.kind,
    })
    .from(escrows)
    .where(eq(escrows.id, escrow_id))
    .limit(1)
  if (row === undefined) return

  const copy = noticeCopyFor(notice, row.kind)

  // Prefer the counterparty the applier resolved over the one on the row:
  // a RELEASED counterparty has already been cleared from the row, so reading
  // it back would address nobody. Falls back to the row for every event that
  // does not carry one.
  const counterparty_id = event.counterparty_id ?? row.counterparty_id
  const recipients =
    copy.recipient === 'both'
      ? [row.creator_id, counterparty_id]
      : copy.recipient === 'creator'
        ? [row.creator_id]
        : [counterparty_id]

  await enqueueEscrowNotice(fastify.queue, escrow_id, row.kind, recipients, copy)
}
