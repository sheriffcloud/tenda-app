/**
 * Notification write path — the SINGLE producer for 'notifications' jobs. All
 * notice sources (escrow fan-out, review/fiat listeners, new-gig subscriber
 * fan-out) route through `enqueueNotification` so every job carries a stable
 * id → the delivery worker's insert is idempotent across BullMQ retries.
 *
 * Was one 318-line file. Split by WHO RUNS WHAT, which is the seam the module
 * already had: ./ids is pure identity (no queue, no db), ./push-data is the
 * deep-link contract a notice carries, ./persist is the worker half that writes
 * the row and broadcasts, and this file is the producer half plus the barrel.
 * The `@server/lib/notify` import path is unchanged for all fourteen consumers.
 */

import { randomUUID } from 'node:crypto'
import type { QueueService, JobPayload, EnqueueOptions } from '@server/plugins/queue'
import { assertNotificationId } from './ids'
import type { PushData } from './push-data'

export { stableNotificationId } from './ids'
export {
  chatPushData,
  disputePushData,
  escrowPushData,
  fiatIntentPushData,
} from './push-data'
export type { PushData } from './push-data'
export { persistNotification, toNotificationWire } from './persist'
export type { PersistDeps, PersistOutcome } from './persist'

export interface NotificationInput {
  user_id: string
  title: string
  body: string
  data?: PushData
  /** Persist to the in-app centre + WS-broadcast. Default true; chat sets false. */
  persist?: boolean
  /**
   * Caller-supplied notification id, for producers that can be re-run for the
   * same logical notice (a channel job retried by BullMQ re-enqueues rather
   * than re-delivering, so the default random id would write a second row).
   * Build it with `stableNotificationId` — see the UUID guard in ./ids.
   */
  id?: string
}

/**
 * `NotificationInput` → the job payload, VALIDATING as it goes.
 *
 * Shared by the single- and many-recipient producers so the two cannot drift on
 * what a notification job looks like — the id default, the `persist` default
 * and the absent-vs-empty `data` rule are each decided once. It also puts the
 * id guard on the only path that builds a payload, which is what lets the
 * fan-out below validate the whole batch before enqueuing any of it: building
 * is separate from sending.
 */
function notificationJob(input: NotificationInput): JobPayload['notifications'] {
  if (input.id !== undefined) assertNotificationId(input.id)
  return {
    id: input.id ?? randomUUID(),
    user_id: input.user_id,
    title: input.title,
    body: input.body,
    ...(input.data !== undefined ? { data: input.data } : {}),
    persist: input.persist ?? true,
  }
}

/**
 * Enqueue a notification. Stamps a stable id so the delivery worker can insert
 * with onConflictDoNothing — a retried job re-uses the same id and never
 * writes a duplicate row or double-fires the badge. `opts` passes through to
 * the queue (e.g. expire-escrows' `job_id` for cross-tick dedup).
 *
 * A caller-supplied `id` extends that idempotency across PRODUCER re-runs, not
 * just BullMQ's own retry of one job.
 */
export async function enqueueNotification(
  queue: Pick<QueueService, 'enqueue'>,
  input: NotificationInput,
  opts?: EnqueueOptions,
): Promise<void> {
  await queue.enqueue('notifications', notificationJob(input), opts)
}

/**
 * One notice, many recipients. Extends `NotificationInput` rather than
 * re-listing its fields so the two cannot drift — a field added there is
 * available here for free.
 */
export interface ManyNotificationInput extends Omit<NotificationInput, 'user_id' | 'id'> {
  /**
   * Per-recipient stable id, for producers that can be re-run for the same
   * logical notice. A FUNCTION of the recipient, never a plain string: the
   * notification id is the primary key, so one id shared across recipients
   * would let `persistNotification`'s onConflictDoNothing drop every row after
   * the first — the fan-out would silently notify one person. Build it with
   * `stableNotificationId`.
   */
  idFor?: (user_id: string) => string
}

/**
 * Enqueue the same notice to a list of recipients.
 *
 * The one loop by which a notice reaches more than one user. Every fan-out
 * (escrow parties, applicants, new-gig subscribers, dispute alerts) routes
 * through it, so the null-skip and the shared `data` bag are decided once —
 * this module's docstring claims to be the single producer of 'notifications'
 * jobs, and a second copy of this loop elsewhere would make that false.
 *
 * Nullable ids are accepted so callers can pass a party that may be absent
 * (an unassigned counterparty) without filtering at every call site.
 *
 * ONE ROUND TRIP, not one per recipient. The whole batch goes through
 * `enqueueMany`, which pipelines it — a subscriber fan-out to a thousand users
 * used to pay the Redis round trip a thousand times, and that cost is paid
 * inside the verify-tx worker slot that produced it.
 *
 * ALL-OR-NOTHING on a bad id. Every job is BUILT — which is where `idFor` is
 * resolved and validated — before anything is sent, because the guard throws.
 * Validating as we sent would leave a PARTIAL fan-out: the recipients before
 * the bad id notified, the ones after it silently not. Half a fan-out is worse
 * than none, since nothing downstream can tell it happened. Batching makes that
 * structural rather than merely careful — there is now a single send, so there
 * is no point between two sends for the guard to fire.
 *
 * Not transactional beyond that: `enqueueMany` pipelines rather than
 * transacts, so a Redis failure part-way still leaves some jobs enqueued. That
 * one is the queue's to own (jobs are retried), whereas a malformed id is a
 * caller bug that can be caught for free before any side effect.
 */
export async function enqueueNotificationToMany(
  queue: Pick<QueueService, 'enqueueMany'>,
  user_ids: readonly (string | null)[],
  notice: ManyNotificationInput,
): Promise<void> {
  const jobs = user_ids
    .filter((user_id): user_id is string => user_id !== null)
    .map((user_id) => {
      const id = notice.idFor?.(user_id)
      // Fields named rather than spread: `notice` may be a wider object than
      // ManyNotificationInput (excess-property checks only apply to literals),
      // and a spread would carry those extras into the job input.
      return {
        payload: notificationJob({
          user_id,
          title: notice.title,
          body: notice.body,
          ...(notice.data !== undefined ? { data: notice.data } : {}),
          ...(notice.persist !== undefined ? { persist: notice.persist } : {}),
          ...(id !== undefined ? { id } : {}),
        }),
      }
    })

  // Nothing to send is not a queue operation. Without this, a fan-out whose
  // recipients were all null would reach the queue and — on a box with no
  // REDIS_URL, where the stub throws — start failing a case that previously
  // succeeded by doing nothing. The old loop simply never iterated.
  if (jobs.length === 0) return

  await queue.enqueueMany('notifications', jobs)
}
