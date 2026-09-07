/**
 * Capacity store — the one place that defines which escrows consume a
 * worker's slot. Drizzle seam, mirroring features/reputation/store.ts.
 */

import { and, count, eq, gt, isNull, or, type SQL } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import type { AppDatabase } from '@server/plugins/db'

export interface CapacityStore {
  /** Live gigs where `user_id` is the worker. See `activeGigCondition`. */
  countActiveGigs(user_id: string, now: Date, grace_period_seconds: number): Promise<number>
}

/**
 * A gig consumes a slot while the worker still owes something on it, or is
 * still owed something within the fair window:
 *
 *  - `accepted` and the delivery window (+ grace) has not run out. Past that,
 *    the worker can no longer submit at all — only the CREATOR can act, via
 *    `reclaim_abandoned`, which costs them gas and which nothing forces them
 *    to do. Counting those would let one absent poster permanently occupy a
 *    slot; the reclaim nudge in jobs/expire-escrows chases them, but the
 *    worker must not be held hostage while it does.
 *  - `submitted` and the approval window is still open. Once it passes, the
 *    worker is free to `claim_stalled` and the poster is the one stalling —
 *    charging the worker for that would penalise them for someone else's
 *    inaction, the very behaviour `ghosted_approval` already penalises the
 *    poster for.
 *
 * Deliberately excluded:
 *  - `disputed` — open-ended (it exits only via an admin resolve), so counting
 *    it would tax raising a legitimate dispute.
 *  - `kind = 'exchange'` — a P2P trade makes you the counterparty too, and a
 *    gig cap must never block trading.
 *  - Terminal statuses and `draft`, which carry no obligation.
 *
 * NULL deadlines count as live: absence of a deadline is not evidence the
 * window has passed, and refusing to count them would be the unsafe default.
 *
 * The grace period is folded into the cutoff in JS rather than added to the
 * column in SQL — `completion_deadline + grace > now` is exactly
 * `completion_deadline > now - grace`. That keeps the comparison a plain
 * column predicate, so `escrows_counterparty_idx` and the deadline indexes
 * stay usable, and it avoids a raw `sql` fragment (postgres-js cannot bind a
 * bare Date inside one — it only serialises Dates through Drizzle's typed
 * column helpers).
 */
function activeGigCondition(
  user_id: string,
  now: Date,
  grace_period_seconds: number,
): SQL | undefined {
  const submitCutoff = new Date(now.getTime() - grace_period_seconds * 1_000)
  return and(
    eq(escrows.counterparty_id, user_id),
    eq(escrows.kind, 'gig'),
    or(
      and(
        eq(escrows.status, 'accepted'),
        // A worker who has told us they are not available (approval mode's
        // off-chain "release") owes nothing further on this gig — only the
        // poster can move it, by unassigning on-chain. Holding their slot
        // until the poster gets round to it would punish the honest signal
        // this feature exists to encourage.
        isNull(escrows.assignment_released_at),
        or(isNull(escrows.completion_deadline), gt(escrows.completion_deadline, submitCutoff)),
      ),
      and(
        eq(escrows.status, 'submitted'),
        or(isNull(escrows.approval_deadline), gt(escrows.approval_deadline, now)),
      ),
    ),
  )
}

export function drizzleCapacityStore(db: AppDatabase): CapacityStore {
  return {
    async countActiveGigs(user_id, now, grace_period_seconds) {
      const [row] = await db
        .select({ value: count() })
        .from(escrows)
        .where(activeGigCondition(user_id, now, grace_period_seconds))
      return row?.value ?? 0
    },
  }
}
