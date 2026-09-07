/**
 * Side-effect capture for fan-out tests: the two seams by which anything
 * reaches a user leave this process — a job on the queue, and a WS frame.
 *
 * Tests that assert "who was told what" swap both for arrays instead of
 * running a real worker. Three suites had grown their own copy of that swap,
 * which is two too many for a decision as load-bearing as what counts as
 * having notified someone.
 *
 * The queue half is helpers/queue-double.ts, unchanged. This module adds what
 * only makes sense against a LIVE fastify instance: the WS seam, the install,
 * and `interceptQueue` for making one queue fail or resolve late. A unit test
 * and an integration test still read the same captured shape.
 */
import type { FastifyInstance } from 'fastify'
import type { JobName, JobPayload } from '@server/plugins/queue'
import { queueDouble, type CapturedAlert, type CapturedJob } from './queue-double'

export interface Broadcast {
  channel: string
  payload: Record<string, unknown>
}

export interface SideEffectCapture {
  /**
   * Jobs enqueued since install, in order. A distributed union over `JobName`:
   * narrow with `e.name === '<queue>'` before reaching into `e.payload`, or use
   * `notifications()` below. It used to be typed as if every job were a
   * notification, which was true only until a second queue shared this seam.
   */
  enqueued: CapturedJob[]
  /**
   * Batch sizes passed to `enqueueMany`, in order — the ONE thing `enqueued`
   * cannot show, because it flattens bulk jobs in with single ones.
   *
   * Forwarded from the double because a producer that pages its recipients is
   * indistinguishable from one that sends them all at once by any other
   * measurement: same recipients, same notices, same order. The page boundary
   * only exists here.
   */
  bulkBatchSizes: number[]
  /** WS frames broadcast since install, in order. */
  broadcasts: Broadcast[]
  /** The notification payloads only, narrowed — the common case. */
  notifications(): JobPayload['notifications'][]
  /** Recipients of the notification jobs — the assertion most tests make. */
  notifiedUserIds(): string[]
  /**
   * The alert jobs only, narrowed, with their enqueue options.
   *
   * Forwarded for the same reason `notifications()` is: without it, the fan-out
   * and end-to-end alert tests would each hand-roll the `name === 'alerts'`
   * flatMap, which is both the DRY violation this helper exists to prevent and
   * the one place a cast creeps back in (narrowing a distributed union by
   * `filter` does not narrow). Keeps `opts` because for alerts the dedup id and
   * the retry budget ARE the subject — see alertsOf.
   */
  alerts(): CapturedAlert[]
}

/**
 * Replace the app's queue + WS broadcast with recorders and return what they
 * record. Call it again to start a fresh recording (the previous capture keeps
 * whatever it had, so a test can snapshot one phase then re-arm for the next).
 */
export function installCapture(app: FastifyInstance): SideEffectCapture {
  const queue = queueDouble()
  const broadcasts: Broadcast[] = []

  app.queue.enqueue = queue.enqueue
  // BOTH producer seams, or the capture is silently partial: every multi-
  // recipient fan-out goes through `enqueueMany`, so swapping only `enqueue`
  // would let those jobs reach the real (stubbed, 501-throwing) queue while the
  // test asserted an empty list and passed.
  app.queue.enqueueMany = queue.enqueueMany
  app.wsBroadcast.broadcast = (channel, payload) => {
    broadcasts.push({ channel, payload })
    // The real broadcast answers how many sockets received the frame; no test
    // asserts on it, but the signature is part of the seam being replaced.
    return 0
  }

  return {
    // Shares the double's arrays by reference, so they fill as jobs arrive.
    enqueued: queue.calls,
    bulkBatchSizes: queue.bulkBatchSizes,
    broadcasts,
    notifications: queue.notifications,
    notifiedUserIds: () => queue.notifications().map((n) => n.user_id),
    alerts: queue.alerts,
  }
}

/**
 * `installCapture`, plus a hook that runs before jobs land on ONE named queue.
 *
 * Two questions a plain capture cannot answer, both about a single fan-out step
 * in isolation:
 *
 *   - REJECT from `onJob` to fail that queue and no other, which is what
 *     separates "this step failed and was contained" from "nothing got through
 *     at all". Replacing `enqueue` wholesale cannot tell those apart.
 *   - DELAY in `onJob` to make the round trip observable. The double records
 *     synchronously, which is convenient and slightly untrue — a real enqueue
 *     is a trip to Redis — so an unawaited producer is invisible without this.
 *
 * `Parameters<typeof inner>` rather than a re-spelled signature: `enqueue` is
 * generic over `JobName` and correlates `payload` to it, which a hand-written
 * parameter list cannot express — forwarding the tuple keeps the wrapper honest
 * without the payload cast that spelling it out would need.
 */
export function interceptQueue(
  app: FastifyInstance,
  name: JobName,
  onJob: () => Promise<void>,
): SideEffectCapture {
  const capture = installCapture(app)

  const inner = app.queue.enqueue
  app.queue.enqueue = async (...args: Parameters<typeof inner>) => {
    if (args[0] === name) await onJob()
    return inner(...args)
  }

  // BOTH seams, for the same reason `installCapture` swaps both — and here the
  // failure would be quieter. Wrapping only `enqueue` leaves every multi-
  // recipient fan-out unintercepted, so a test asserting "this queue failed and
  // was contained" would be asserting it against a queue that never failed, and
  // would pass. `onJob` fires ONCE per batch, not once per job: the batch is the
  // round trip, so it is the thing that succeeds or fails.
  const innerMany = app.queue.enqueueMany
  app.queue.enqueueMany = async (...args: Parameters<typeof innerMany>) => {
    if (args[0] === name) await onJob()
    return innerMany(...args)
  }

  return capture
}
