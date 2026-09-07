/**
 * In-process BullMQ workers + repeatable schedules (#33; stage-0 open
 * question resolved: in-process is fine until volume justifies a separate
 * worker deployment, at which point this plugin moves verbatim into its
 * own entrypoint).
 *
 * Gated on REDIS_URL: without it nothing starts and the API behaves
 * exactly as pre-#33 (queue 501s, reconciliation absent, client-ping +
 * lazy expiry carry the load).
 *
 * Retry posture: verify-tx throws RetryableError while a tx awaits
 * confirmation, BullMQ retries on the queue's exponential backoff; once
 * attempts exhaust, the reconcile repeatable owns the attempt (its 5-min
 * scan re-enqueues anything the chain eventually confirms and times out
 * the rest at 30min, stage-2 § reconciliation).
 */

import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { Queue, Worker } from 'bullmq'
import { getConfig } from '@server/config'
import {
  queueConnectionOptions,
  queueName,
  queueOptions,
  type JobName,
  type JobPayload,
} from '@server/plugins/queue'
import { buildProcessors } from '@server/workers/processors'

/**
 * Per-queue worker parallelism. `Record<JobName, number>` so a new queue cannot
 * ship without one.
 *
 * Exported for the processor-coverage test: it is the one runtime value that
 * enumerates every JobName, so the test derives its list from here instead of
 * hand-writing one. The hand-written version had already drifted twice.
 */
export const WORKER_CONCURRENCY: Record<JobName, number> = {
  'verify-tx': 8,
  notifications: 8,
  'send-otp': 8, // user-facing latency-sensitive; parallelise like notifications
  'expire-escrows': 1, // repeatable batch jobs never need parallelism
  'expire-applications': 1,
  reconcile: 1,
  'reconcile-fiat': 1,
  'expire-fiat-quotes': 1,
  'update-price-stats': 1,
  'prune-notifications': 1,
  // Two, not eight: the point of moving expansion off the verify-tx worker was
  // to stop one popular gig blocking a scarce slot, and a queue of its own does
  // that at concurrency 1. The second slot is so a 50,000-subscriber gig does
  // not head-of-line block the three-subscriber one posted a second later.
  // Higher would only widen the burst this job pushes onto `notifications`,
  // which is the pressure the split was meant to bound rather than relocate.
  'fanout-subscribers': 2,
  // Outbound HTTP (a Slack webhook) plus one small read — I/O-bound, not CPU,
  // so it parallelises. Lower than notifications because the volume is orders
  // of magnitude smaller: one dispute, not one per subscriber.
  alerts: 4,
}

interface RepeatableSpec<N extends JobName> {
  name: N
  every_ms: number
  payload: JobPayload[N]
}

function repeatable<N extends JobName>(spec: RepeatableSpec<N>): RepeatableSpec<N> {
  return spec
}

/**
 * The complete periodic schedule, exported so tests can assert that every
 * repeatable handler is actually registered here (the price-stats rollup
 * shipped tested-but-unscheduled once; the schedule test pins against that).
 */
export const REPEATABLES = [
  repeatable({ name: 'expire-escrows', every_ms: 60_000, payload: { tick_id: 'cron' } }),
  repeatable({ name: 'expire-applications', every_ms: 60_000, payload: { tick_id: 'cron' } }),
  repeatable({ name: 'reconcile', every_ms: 5 * 60_000, payload: {} }),
  repeatable({ name: 'reconcile-fiat', every_ms: 5 * 60_000, payload: { tick_id: 'cron' } }),
  repeatable({ name: 'expire-fiat-quotes', every_ms: 60_000, payload: { tick_id: 'cron' } }),
  // Nightly rollup (stage-6): grounds the moderation price-sanity prompts.
  repeatable({ name: 'update-price-stats', every_ms: 24 * 3_600_000, payload: { tick_id: 'cron' } }),
  // Daily retention sweep: prunes stale personal notifications (unbounded growth).
  repeatable({ name: 'prune-notifications', every_ms: 24 * 3_600_000, payload: { tick_id: 'cron' } }),
] as const

const workersPlugin: FastifyPluginAsync = async (fastify) => {
  const { REDIS_URL } = getConfig()
  if (REDIS_URL === null) {
    fastify.log.info('workers: REDIS_URL unset, queue consumers not started')
    return
  }

  const connection = queueConnectionOptions(REDIS_URL)
  const processors = buildProcessors(fastify)
  const workers: Worker[] = []

  for (const name of Object.keys(processors) as JobName[]) {
    const worker = new Worker(
      queueName(name),
      async (job) => {
        // The map is keyed by JobName; job.data carries the matching
        // payload (enforced at enqueue by QueueService's generics).
        const processor = processors[name] as (payload: unknown) => Promise<unknown>
        return processor(job.data)
      },
      { connection, concurrency: WORKER_CONCURRENCY[name] },
    )
    worker.on('failed', (job, err) => {
      // RetryableError exhausting attempts is expected for slow chains,
      // the reconcile repeatable owns the attempt from here. Anything
      // else deserves a louder line.
      if (err.name === 'RetryableError') {
        fastify.log.info(
          { queue: name, job_id: job?.id, attempts: job?.attemptsMade },
          'worker: job deferred to reconcile (tx not yet confirmed)',
        )
      } else {
        fastify.log.warn(
          { queue: name, job_id: job?.id, attempts: job?.attemptsMade, err: err.message },
          'worker: job failed',
        )
      }
    })
    workers.push(worker)
  }

  // Repeatable schedules, deterministic scheduler ids make boot
  // re-registration an upsert, never a duplicate.
  //
  // `queueOptions`, not a bare `{ connection }`: BullMQ merges THIS queue's
  // defaultJobOptions into the scheduler template, and the template is what
  // every tick this scheduler ever produces is built from. Without it the
  // repeatables kept every completed job forever — see queueOptions' note.
  const schedulerQueues: Queue[] = []
  for (const r of REPEATABLES) {
    const q = new Queue(queueName(r.name), queueOptions(connection, r.name))
    await q.upsertJobScheduler(
      `sched:${r.name}`,
      { every: r.every_ms },
      { name: r.name, data: r.payload },
    )
    schedulerQueues.push(q)
  }
  await Promise.allSettled(schedulerQueues.map((q) => q.close()))

  fastify.log.info(
    { queues: Object.keys(processors), repeatables: REPEATABLES.map((r) => r.name) },
    'workers: BullMQ consumers + schedulers started',
  )

  fastify.addHook('onClose', async () => {
    await Promise.allSettled(workers.map((w) => w.close()))
  })
}

export default fp(workersPlugin, {
  name: 'workers',
  dependencies: ['queue', 'db', 'chains', 'websocket'],
})
