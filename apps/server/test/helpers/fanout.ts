/**
 * Driving the new-gig expansion across its queue hop.
 *
 * `fanOutEscrowEvent` no longer expands a gig into per-subscriber notices — it
 * enqueues ONE 'fanout-subscribers' job and returns, so the verify-tx worker
 * slot it runs on is freed immediately. Every test that asks "who hears about
 * this gig?" therefore has to run the other side of that hop too, and this is
 * the one place that knows how.
 *
 * ONE suite imports it today — gig-subscription-fanout, from a dozen tests. It
 * lives here rather than inline in that file because it is the consumer half of
 * the seam helpers/side-effects.ts owns the producer half of: that module
 * decides what counts as a job being enqueued, this one decides what counts as
 * that job being worked. Splitting the two across a helper and a test file
 * would put half the answer somewhere nothing else can reach.
 */
import type { FastifyInstance } from 'fastify'
import { buildProcessors } from '@server/workers/processors'
import type { JobPayload } from '@server/plugins/queue'
import type { SideEffectCapture } from './side-effects'

/**
 * Run every captured expansion job, as a worker would, and return their
 * payloads in enqueue order.
 *
 * The jobs are REMOVED from `capture.enqueued` as they run, which is not
 * bookkeeping for its own sake: it means an assertion about what users received
 * sees only user-facing jobs, exactly as it did before the hop existed. A test
 * that wants to assert on the hop itself reads the returned payloads (or asserts
 * before draining), so nothing is hidden — it is consumed, and the consumer
 * hands it back.
 *
 * Goes through `buildProcessors` rather than calling the fan-out function
 * directly so the queue→processor binding is covered too. Calling the function
 * would leave 'fanout-subscribers' bound to nothing and every one of these tests
 * would still pass.
 */
export async function drainSubscriberFanout(
  app: FastifyInstance,
  capture: SideEffectCapture,
): Promise<JobPayload['fanout-subscribers'][]> {
  const drained: JobPayload['fanout-subscribers'][] = []

  // Backwards so a splice cannot shift a not-yet-visited index past the cursor.
  for (let i = capture.enqueued.length - 1; i >= 0; i--) {
    const job = capture.enqueued[i]
    if (job.name !== 'fanout-subscribers') continue
    drained.unshift(job.payload)
    capture.enqueued.splice(i, 1)
  }

  // Before building anything: `buildProcessors` constructs the push services and
  // the OTP senders, and most callers reach here with nothing to drain.
  if (drained.length === 0) return drained

  const run = buildProcessors(app)['fanout-subscribers']
  // Sequentially, and only after the whole list is collected. Interleaving would
  // in fact be harmless — the processor APPENDS notification jobs, and the scan
  // walks backwards, so it would never reach them — but that is a coincidence of
  // two directions lining up, and it stops being true the moment either changes.
  // Collect, then run: no reasoning required.
  for (const payload of drained) await run(payload)

  return drained
}
