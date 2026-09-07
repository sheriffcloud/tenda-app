/**
 * expire-escrows repeatable job (stage-0-foundation.md § Infrastructure:
 * every 60s). Replaces the legacy request-path lazy expiry
 * (`lib/gigs.ts:checkAndExpireGig`) once the cutover removes it.
 *
 * v2 semantics: there is NO `expired` status, `escrows.status` is a
 * faithful mirror of on-chain state, and the chain keeps an unaccepted
 * escrow `Open` until the creator pulls `refund_expired`. What expiry means
 * server-side is therefore:
 *   1. Listings exclude open escrows past `accept_deadline` at query time
 *      (listing-route concern, cutover §3).
 *   2. This job nudges creators to reclaim: one notification per expired
 *      escrow, made idempotent by a deterministic BullMQ job_id, re-ticks
 *      never re-notify.
 *
 * The repeatable scheduling + worker wiring land with #33 (Redis); the
 * handler is complete and tested now, same pattern as jobs/verify-tx.ts.
 */

import { and, eq, gte, isNull, lt } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import { enqueueNotification, escrowPushData } from '@server/lib/notify'
import type { JobPayload, QueueService } from '@server/plugins/queue'
import type { AppDatabase } from '@server/plugins/db'

// ---------- store abstraction --------------------------------------------

/** Minimum shape a deadline-crossing notice needs. */
export interface NotifiableEscrow {
  id: string
  kind: 'gig' | 'exchange'
  creator_id: string
}

export type ExpiredOpenEscrow = NotifiableEscrow

/** An accepted escrow whose delivery window (+ grace) just ran out. */
export type StalledAcceptedEscrow = NotifiableEscrow

export interface ExpireEscrowsStore {
  /**
   * Open, never-accepted escrows whose accept_deadline fell inside
   * `[since, until)`. The bounded window is the idempotency backbone: an
   * unclaimed escrow stays `open` in the DB indefinitely, and BullMQ job_id
   * dedup only holds while the completed notification job is retained, so
   * an unbounded "deadline < now" scan would re-notify every tick once the
   * job is pruned. A row can only match while its deadline is inside the
   * window; the deterministic job_id absorbs the overlap between ticks.
   */
  findNewlyExpiredOpen(since: Date, until: Date, limit: number): Promise<ExpiredOpenEscrow[]>
  /**
   * Accepted escrows whose `completion_deadline + grace` fell inside
   * `[since, until)`. Same bounded-window idempotency as above.
   *
   * Past this point the worker can no longer submit, so the escrow is stuck
   * until the CREATOR pulls `reclaim_abandoned` — which costs them gas and
   * which nothing prompts them to do. Their funds sit locked, the worker's
   * `abandoned` standing signal never fires, and (pre-capacity-cap) the row
   * would have occupied one of the worker's slots indefinitely. This scan is
   * the nudge; `features/capacity` independently stops counting the row.
   */
  findNewlyStalledAccepted(
    since: Date,
    until: Date,
    limit: number,
    grace_period_seconds: number,
  ): Promise<StalledAcceptedEscrow[]>
}

export function drizzleExpireEscrowsStore(db: AppDatabase): ExpireEscrowsStore {
  return {
    async findNewlyExpiredOpen(since, until, limit) {
      return db
        .select({ id: escrows.id, kind: escrows.kind, creator_id: escrows.creator_id })
        .from(escrows)
        .where(
          and(
            eq(escrows.status, 'open'),
            isNull(escrows.counterparty_id),
            gte(escrows.accept_deadline, since),
            lt(escrows.accept_deadline, until),
          ),
        )
        .orderBy(escrows.accept_deadline)
        .limit(limit)
    },

    async findNewlyStalledAccepted(since, until, limit, grace_period_seconds) {
      // The submit window closes at completion_deadline + grace. Asking for
      // that sum to land in [since, until) is exactly asking for
      // completion_deadline to land in [since - grace, until - grace), so the
      // grace is folded into the bounds in JS. Keeps the predicate a plain
      // column range (index-usable, and postgres-js cannot bind a bare Date
      // inside a raw `sql` fragment).
      const graceMs = grace_period_seconds * 1_000
      return db
        .select({ id: escrows.id, kind: escrows.kind, creator_id: escrows.creator_id })
        .from(escrows)
        .where(
          and(
            eq(escrows.status, 'accepted'),
            gte(escrows.completion_deadline, new Date(since.getTime() - graceMs)),
            lt(escrows.completion_deadline, new Date(until.getTime() - graceMs)),
          ),
        )
        .orderBy(escrows.completion_deadline)
        .limit(limit)
    },
  }
}

// ---------- handler -------------------------------------------------------

/** Rows scanned per tick. Overflow is logged and picked up next tick. */
export const EXPIRE_BATCH_LIMIT = 200

/**
 * How far back a tick looks for newly-crossed deadlines. Covers worker
 * restarts/outages up to this long; older missed nudges are deliberately
 * skipped (a stale "your gig just expired" push is worse than none).
 * Must exceed the tick interval (60s) so consecutive windows overlap.
 *
 * #33 worker-config constraint: completed `notifications` jobs must be
 * retained (removeOnComplete age) for at least this long, the job_id
 * dedup covers the window overlap only while the prior job still exists.
 */
export const EXPIRE_LOOKBACK_MS = 5 * 60_000

/**
 * Deterministic notification job id, the idempotency guarantee.
 *
 * Dot-joined, NOT colon-joined — BullMQ rejects a custom jobId containing
 * ':' unless it has exactly three ':'-separated parts (classes/job.js
 * validateOptions; the rule verify-tx's dedup key already documents). The
 * colon spelling shipped and failed EVERY notice enqueue — and the whole
 * tick with it — the first time an escrow expired against real BullMQ
 * (2026-08-27); the queue double in tests never ran the validator, which is
 * why the id test beside the stable-id pins now encodes the rule itself.
 * A UUID contains no '.', so the join cannot collide.
 */
export function expireNoticeJobId(escrow_id: string): string {
  return `expire-notice.${escrow_id}`
}

/**
 * Separate id space from the expiry notice: the same escrow can legitimately
 * produce both notices over its life (it cannot cross both deadlines, but the
 * ids must not collide if the state machine ever allows it).
 */
export function stalledNoticeJobId(escrow_id: string): string {
  return `stalled-notice.${escrow_id}`
}

export interface ExpireEscrowsLogger {
  info(obj: Record<string, unknown>, msg: string): void
  warn(obj: Record<string, unknown>, msg: string): void
}

export interface ExpireEscrowsDeps {
  store: ExpireEscrowsStore
  queue: Pick<QueueService, 'enqueue'>
  log: ExpireEscrowsLogger
  /** Injected clock so deadline-edge tests are deterministic. */
  now(): Date
  /**
   * `platform_config.grace_period_seconds`, resolved by the caller. The submit
   * window is `completion_deadline + grace`, and grace is admin-tunable, so it
   * is injected rather than read here — the handler stays I/O-free besides its
   * store and queue.
   */
  grace_period_seconds: number
}

export interface ExpireEscrowsResult {
  /** Rows seen across BOTH scans. */
  scanned: number
  enqueued: number
}

/**
 * The delivery window closed with no submission. The creator is the only party
 * who can act (`reclaim_abandoned`), so they are the only recipient — the
 * worker's slot is already freed by features/capacity without telling them
 * they failed.
 */
const STALLED_COPY: Record<NotifiableEscrow['kind'], { title: string; body: string }> = {
  gig: {
    title: 'Your gig was not delivered',
    body: 'The delivery window closed without a submission. Reclaim your escrowed funds from the gig page.',
  },
  exchange: {
    title: 'Your trade was not completed',
    body: 'The payment window closed without confirmation. Reclaim your escrowed crypto from the offer page.',
  },
}

const NOTICE_COPY: Record<NotifiableEscrow['kind'], { title: string; body: string }> = {
  gig: {
    title: 'Your gig expired',
    body: 'Nobody accepted before the deadline. Reclaim your escrowed funds from the gig page.',
  },
  exchange: {
    title: 'Your exchange offer expired',
    body: 'Nobody accepted before the deadline. Reclaim your escrowed funds from the offer page.',
  },
}

/**
 * Enqueue one deterministic notice per row. Shared by both scans so the
 * copy lookup, push payload and job-id keying exist once.
 */
async function enqueueNotices(
  deps: ExpireEscrowsDeps,
  rows: readonly NotifiableEscrow[],
  copyByKind: Record<NotifiableEscrow['kind'], { title: string; body: string }>,
  jobId: (escrow_id: string) => string,
): Promise<number> {
  let enqueued = 0
  for (const row of rows) {
    const copy = copyByKind[row.kind]
    await enqueueNotification(
      deps.queue,
      {
        user_id: row.creator_id,
        title: copy.title,
        body: copy.body,
        data: escrowPushData(row.id, row.kind),
      },
      { job_id: jobId(row.id) },
    )
    enqueued += 1
  }
  return enqueued
}

export async function handleExpireEscrows(
  deps: ExpireEscrowsDeps,
  payload: JobPayload['expire-escrows'],
): Promise<ExpireEscrowsResult> {
  const until = deps.now()
  const since = new Date(until.getTime() - EXPIRE_LOOKBACK_MS)

  // Two deadline crossings, one tick: nobody accepted before accept_deadline,
  // and nobody delivered before completion_deadline + grace. Both leave the
  // creator's funds locked pending a refund/reclaim only they can sign, so
  // both are the same nudge with different copy.
  const [expired, stalled] = await Promise.all([
    deps.store.findNewlyExpiredOpen(since, until, EXPIRE_BATCH_LIMIT),
    deps.store.findNewlyStalledAccepted(
      since,
      until,
      EXPIRE_BATCH_LIMIT,
      deps.grace_period_seconds,
    ),
  ])

  const enqueued =
    (await enqueueNotices(deps, expired, NOTICE_COPY, expireNoticeJobId)) +
    (await enqueueNotices(deps, stalled, STALLED_COPY, stalledNoticeJobId))

  for (const [scan, rows] of [
    ['expired-open', expired],
    ['stalled-accepted', stalled],
  ] as const) {
    if (rows.length === EXPIRE_BATCH_LIMIT) {
      // No silent caps: surface that this tick did not drain the backlog.
      deps.log.warn(
        { tick_id: payload.tick_id, scan, limit: EXPIRE_BATCH_LIMIT },
        'expire-escrows: batch limit hit, remainder picked up next tick',
      )
    }
  }

  const scanned = expired.length + stalled.length
  deps.log.info(
    {
      tick_id: payload.tick_id,
      scanned,
      enqueued,
      expired: expired.length,
      stalled: stalled.length,
    },
    'expire-escrows tick complete',
  )
  return { scanned, enqueued }
}
