/**
 * What every queue in this app carries — the single source `JobName` derives
 * from, and the file that grows every time a queue is added.
 *
 * Kept apart from the plugin that enqueues them because they change for
 * different reasons and at different rates: this is edited whenever a feature
 * needs a new background job, ./index.ts only when the producer surface itself
 * changes. It is also the only part of the module a reader adding a
 * queue needs, and it was the block that pushed the single file past its
 * budget.
 *
 * TYPE-ONLY, and it must stay that way: `export type` is erased by the
 * compiler, so nothing here reaches runtime and no importer of `plugins/queue`
 * pays for it. The `AlertJob` import below depends on that.
 */

import type { VerifyTxJobPayload } from '@server/queue/jobs/verify-tx'
import type { OtpMessage } from '@server/features/auth/otp'
// TYPE-ONLY, and it must stay that way: features/alerts/types/channel.ts
// imports `QueueService` back from this module's barrel, so the two reference
// each other. Both directions are erased today (verified in the emitted JS —
// neither file requires the other), but a value import on either side would
// close a real runtime cycle, and this plugin loads early enough that the
// alerts feature would be half-initialised when it did.
//
// Splitting the module made that cheaper to hold, not harder: the cycle used to
// run through the file containing the plugin body, and now runs through a file
// whose emitted JS is empty.
import type { AlertJob } from '@server/features/alerts'
// Type-only, like the two above. The gas seed is a removable feature
// (features/gas-seed/index.ts carries the recipe) and this is one of the three
// lines that removal deletes.
import type { GasSeedClaimJob } from '@server/features/gas-seed'

/**
 * Every queue this app runs — DERIVED from `JobPayload`, never hand-listed.
 *
 * These were two independent declarations, so a queue added to one and not the
 * other still compiled: a payload with no name is unreachable, and a name with
 * no payload gets a `WORKER_CONCURRENCY` entry and a processor but no way to
 * describe what it carries. Deriving makes the payload map the single source
 * and turns "add a queue" into one edit. Type aliases are hoisted, so the
 * forward reference to the interface below is fine.
 */
export type JobName = keyof JobPayload

/**
 * Per-queue payload shapes. Stage 0 freezes the surface; #33 implementer
 * wires BullMQ workers consuming these exact shapes.
 */
export interface JobPayload {
  notifications: {
    /**
     * Stable notification id, stamped at enqueue by `enqueueNotification`. The
     * delivery worker inserts with onConflictDoNothing so persistence is
     * idempotent across BullMQ retries (this queue runs `attempts: 5`).
     */
    id: string
    /**
     * Recipient user, the delivery worker resolves device tokens at send
     * time (tokens churn between enqueue and delivery; resolving early
     * would push to stale devices).
     */
    user_id: string
    title: string
    body: string
    data?: Record<string, string>
    /**
     * Persist to the in-app notification centre + WS-broadcast. false for chat
     * (it has its own read surface); true for every escrow/review/fiat/gig
     * notice. Always set by `enqueueNotification`.
     */
    persist: boolean
  }
  'expire-escrows': {
    /** Tick id for log correlation. Cron writer sets `Date.now().toString()`. */
    tick_id: string
  }
  'expire-applications': {
    tick_id: string
  }
  /**
   * #43: release funds stranded in an escrow whose creator never came back to
   * refund themselves. Same tick-id-only shape as the other repeatables — the
   * handler derives its eligibility window from its injected clock.
   */
  'sweep-escrows': {
    tick_id: string
  }
  /** Imported from `queue/jobs/verify-tx.ts` so producer + handler share one shape. */
  'verify-tx': VerifyTxJobPayload
  reconcile: {
    /**
     * Optional log-correlation window. The handler derives its real scan
     * window from its injected clock, repeatable jobs carry a static
     * payload, so these can't be fresh per tick.
     */
    from_iso?: string
    to_iso?: string
  }
  /** Stage-8 repeatables, tick id for log correlation. */
  'reconcile-fiat': { tick_id: string }
  'expire-fiat-quotes': { tick_id: string }
  /**
   * Decoupled OTP delivery, the auth challenge persists the code then enqueues
   * this so the response never blocks on the email/SMS provider. Carries the
   * plaintext code (short-lived; removed on completion via `remove_on_complete`).
   */
  'send-otp': OtpMessage
  /** Nightly category_price_stats rollup (stage-6), tick id for log correlation. */
  'update-price-stats': { tick_id: string }
  /** Daily retention sweep of stale personal notifications, tick id for correlation. */
  'prune-notifications': { tick_id: string }
  /** Daily discard of unfunded drafts past DRAFT_RETENTION_DAYS, tick id for correlation. */
  'prune-stale-drafts': { tick_id: string }
  /** Daily delete of one-time codes older than the OTP send limits can count, tick id for correlation. */
  'prune-auth-otps': { tick_id: string }
  /**
   * Expand a new gig into one notification per matching subscriber.
   *
   * A queue of its own rather than work done inline in the verify-tx republish:
   * the expansion is unbounded in the subscriber count, and doing it inline held
   * one of only 8 verify-tx slots for its whole duration — so a popular gig
   * delayed the transaction verification that users are watching a
   * TransactionMonitor for. Carries the escrow id and nothing else; the worker
   * re-reads the gig, because the row is the source of truth for city/category
   * and copying them into the payload would let a job enqueued before an edit
   * fan out against stale matching criteria.
   */
  'fanout-subscribers': { escrow_id: string }
  /**
   * One operational alert, for ONE channel. Imported rather than re-declared so
   * the producer, this queue and `deliverAlert` cannot describe the job three
   * slightly different ways — see features/alerts/types/channel.ts for why the
   * fan-out is per channel rather than one job that loops them.
   */
  alerts: AlertJob
  /**
   * #53c-1: sign and broadcast one gas seed a user CLAIMED. Carries the pair
   * that identifies the grant and nothing else — the amount and the destination
   * wallet are read from the `gas_grants` row inside the handler, because the
   * row records what the user was actually promised and config may have moved
   * since.
   */
  'gas-seed': GasSeedClaimJob
  /**
   * #58: ask the chain what became of a broadcast seed, and record the answer.
   *
   * A SEPARATE queue from `gas-seed` rather than more work inside it, and that
   * separation is the fix rather than a tidying. Confirmation is unbounded in
   * time — an EVM transfer can mine hours later — so a handler that both
   * broadcast and confirmed had to either hold a worker slot for the duration or
   * give up and GUESS an outcome. It guessed, twice, and both guesses lost
   * money. Split, "not confirmed yet" is a RetryableError and the queue's
   * backoff is the waiting.
   *
   * Same payload as the broadcast job: the grant's key, and nothing that could
   * go stale between the two.
   */
  'gas-seed-confirm': GasSeedClaimJob
  /**
   * #53b: read every gas-seed hot wallet and alert on the ones running low.
   * Tick id only, like the other repeatables — the handler derives its work
   * list from the `chains` rows, because a chain that stopped carrying a seed
   * between two ticks has no wallet to warn about.
   */
  'gas-seed-balance-check': { tick_id: string }
}

