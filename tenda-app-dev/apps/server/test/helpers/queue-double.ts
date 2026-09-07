/**
 * The queue recorder — one place that answers "what got enqueued?".
 *
 * Used directly by unit tests whose subject takes a narrowed slice of
 * `QueueService` — `enqueue`, `enqueueMany`, or both — and composed by
 * helpers/side-effects.ts, which swaps this in on a live fastify instance for
 * integration tests. Both read the same `CapturedJob` shape, so an assertion
 * written against one transfers, and single and bulk jobs land in the same list
 * so an assertion survives a producer switching between them.
 *
 * `CapturedJob` is a distributed union over `JobName`, so `payload` is narrowed
 * by checking `name` — a producer that enqueues onto the wrong queue fails to
 * type-check in the test rather than passing silently, and no reader needs a
 * cast to reach a payload field.
 */
import type { JobName, JobPayload, EnqueueOptions, QueueService } from '@server/plugins/queue'

export type CapturedJob = {
  [N in JobName]: { name: N; payload: JobPayload[N]; opts?: EnqueueOptions }
}[JobName]

/**
 * The notification payloads out of a captured list.
 *
 * `flatMap` rather than `filter().map()`: `filter` does not narrow a
 * discriminated union, so the `.map` would be reaching into a union of every
 * payload shape and would need a cast to compile.
 */
export function notificationsOf(
  calls: readonly CapturedJob[],
): JobPayload['notifications'][] {
  return calls.flatMap((c) => (c.name === 'notifications' ? [c.payload] : []))
}

/**
 * One captured alert job. Named once rather than spelled inline at the function
 * and again on the interface — two copies of a shape are two things to keep in
 * step, which is the whole reason `CapturedJob` is derived rather than listed.
 */
export interface CapturedAlert {
  payload: JobPayload['alerts']
  opts?: EnqueueOptions
}

/**
 * The alert jobs out of a captured list, with their enqueue options.
 *
 * Keeps `opts` unlike `notificationsOf`, because for this queue the options ARE
 * the subject: `job_id` is the dedup key and `attempts` the retry budget, and a
 * producer that got either wrong is indistinguishable from one that got them
 * right if only the payload is returned.
 *
 * A sibling of `notificationsOf` rather than a generic `jobsOf(calls, name)`:
 * comparing `c.name === name` does not narrow `c` while `name` is a type
 * parameter, so the generic version needs the very cast this helper's own note
 * explains how to avoid. Two four-line functions beat one that lies.
 */
export function alertsOf(calls: readonly CapturedJob[]): CapturedAlert[] {
  return calls.flatMap((c) =>
    c.name === 'alerts'
      ? [{ payload: c.payload, ...(c.opts !== undefined ? { opts: c.opts } : {}) }]
      : [],
  )
}

export interface QueueDouble extends Pick<QueueService, 'enqueue' | 'enqueueMany'> {
  /**
   * Everything enqueued since construction, in order — bulk jobs FLATTENED into
   * the same list as single ones.
   *
   * Deliberate: every existing assertion asks "who was notified, with what",
   * and that answer must not depend on which producer path was taken. A
   * separate `bulkCalls` array would have made the batching change rewrite
   * assertions that are about something else entirely.
   */
  calls: CapturedJob[]
  /**
   * How many times `enqueueMany` was invoked, and with what batch sizes.
   *
   * The ONE thing `calls` cannot show, because flattening is exactly what hides
   * it: a producer that looped `enqueue` N times and one that sent a single
   * batch of N are indistinguishable there. This is what a test asserts to
   * prove the round trip is paid once.
   */
  bulkBatchSizes: number[]
  /**
   * Forget everything recorded so far, for a `beforeEach` that reuses one
   * double across tests.
   *
   * Exists because the double now has TWO pieces of state, and the obvious
   * hand-rolled reset clears only the one the test happens to read — leaving
   * the other to accumulate across tests and hand a later assertion data from
   * an earlier one. Truncating in place rather than reassigning is required:
   * `notifications()` and `alerts()` close over the arrays by reference, so a
   * fresh array would silently detach them.
   */
  reset(): void
  /** The notification payloads only, narrowed. */
  notifications(): JobPayload['notifications'][]
  /** The alert jobs only, narrowed, with their enqueue options. */
  alerts(): CapturedAlert[]
}

export function queueDouble(): QueueDouble {
  const calls: CapturedJob[] = []
  const bulkBatchSizes: number[] = []

  // The one assertion in the helper, and it is a limitation rather than a
  // shortcut: TypeScript cannot prove `{ name: N, payload: JobPayload[N] }`
  // inhabits the union while `N` is still generic, so the correlation has to be
  // asserted at the push. Annotating `job` first keeps that narrow — name and
  // payload are each checked against the real types, so the assertion only
  // supplies the pairing TS can't see, and a payload that belongs to no queue
  // at all is still a compile error here.
  //
  // Hoisted out of `enqueue` so the bulk path records through the identical
  // step: two copies would be two chances for the flattened list to disagree
  // with itself about what a captured job looks like.
  function record<N extends JobName>(
    name: N,
    payload: JobPayload[N],
    opts?: EnqueueOptions,
  ): void {
    const job: { name: JobName; payload: JobPayload[JobName]; opts?: EnqueueOptions } = {
      name,
      payload,
      opts,
    }
    calls.push(job as CapturedJob)
  }

  return {
    calls,
    bulkBatchSizes,
    reset() {
      calls.length = 0
      bulkBatchSizes.length = 0
    },
    notifications: () => notificationsOf(calls),
    alerts: () => alertsOf(calls),
    async enqueue(name, payload, opts) {
      record(name, payload, opts)
      return { job_id: 'test-job' }
    },
    async enqueueMany(name, jobs) {
      // Recorded even when empty. The live plugin returns early on an empty
      // batch, so a producer that reaches the queue with nothing to send is a
      // fact worth being able to assert either way.
      bulkBatchSizes.push(jobs.length)
      for (const job of jobs) record(name, job.payload, job.opts)
      return { job_ids: jobs.map(() => 'test-job') }
    },
  }
}
