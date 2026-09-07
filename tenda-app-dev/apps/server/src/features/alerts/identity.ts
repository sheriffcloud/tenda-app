/**
 * What identifies an alert — the one answer to "are these two the same alert?".
 *
 * ITS OWN MODULE, and that placement is load-bearing rather than tidiness.
 * These functions started in ./enqueue-alert, which imports ./registry for its
 * default channel selector. When the in-app channel began seeding its
 * notification ids from `alertIdentity`, that closed a real runtime cycle:
 *
 *   registry → channels/in-app → enqueue-alert → registry
 *
 * Whether it threw depended on which module node happened to load first — the
 * channel tests survived it and a barrel-first import did not, which is the
 * worst shape of bug: latent, order-dependent, and invisible until an unrelated
 * import order changes. Nothing here imports anything but types, so no consumer
 * of alert identity can re-close that loop.
 */

import type { AlertChannelName, AlertKind, AlertRef, AlertRefOf } from './types'

/**
 * What identifies each kind's subject, keyed by kind so a new kind cannot ship
 * without saying what makes two of its alerts the same alert.
 *
 * MUST NOT contain ':' — see `alertJobId` for what BullMQ does with one.
 */
const REF_KEYS: { [K in AlertKind]: (ref: AlertRefOf<K>) => string } = {
  'dispute.raised': (ref) => ref.tx_ref,
}

/**
 * The generic indirection ./resolve-alert uses for the same reason: indexing
 * the map with a generic `K` is what lets TypeScript prove the entry accepts
 * the ref, so no cast is needed. Spelling `ref.kind` against a union-typed
 * `AlertRef` directly does not correlate the two.
 */
function refKey<K extends AlertKind>(ref: AlertRefOf<K>): string {
  return REF_KEYS[ref.kind](ref)
}

const ID_SEPARATOR = ':'

/**
 * What makes two alerts the SAME alert, independent of where they are going.
 *
 * Two dedup mechanisms need this one fact and must not each invent it: the
 * queue keys jobs by it (below), and the in-app channel seeds its per-recipient
 * `stableNotificationId` with it so a redelivered alert job writes no second
 * bell row. Derived separately, a change to what identifies an alert would fix
 * one and silently leave the other keyed on the old idea.
 *
 * TWO ':'-separated parts, so `alertJobId` lands on exactly three — see there
 * for why three is a hard BullMQ constraint rather than a preference.
 */
export function alertIdentity(ref: AlertRef): string {
  return [ref.kind, refKey(ref)].join(ID_SEPARATOR)
}

/**
 * The BullMQ job id, and therefore the dedup key: re-enqueueing the same alert
 * for the same channel is a no-op while the first job is still in Redis.
 *
 * Per channel, not per alert — one job per channel is the whole point (see
 * `AlertJob` in ./types), so a channel-less id would let the first enqueue
 * swallow the second.
 *
 * EXACTLY THREE ':'-separated parts, which is a hard BullMQ constraint, not a
 * style choice: it rejects a custom id containing ':' unless it splits into
 * three (bullmq 5.78, classes/job.js — `'Custom Id cannot contain :'`). The
 * three-part shape is also what core/queue/idempotency.ts already emits, so
 * this reads the same in Redis as every other keyed job. `kind` and
 * `AlertChannelName` are colon-free by construction; `REF_KEYS` says the ref
 * key must be too.
 *
 * Exported so the constraint is pinned directly rather than only through a
 * queue double, where a violation surfaces as an unrelated enqueue failure.
 */
export function alertJobId(ref: AlertRef, channel: AlertChannelName): string {
  return [alertIdentity(ref), channel].join(ID_SEPARATOR)
}
