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
 * Retry posture: a handler throws RetryableError while a transaction awaits
 * confirmation, and BullMQ retries on the queue's exponential backoff. What
 * happens once attempts exhaust is PER QUEUE, which is why the failure log
 * below does not name a specific rescuer:
 *   - `verify-tx` is picked up by the reconcile repeatable (its 5-min scan
 *     re-enqueues anything the chain eventually confirms and times out the rest
 *     at 30min, stage-2 § reconciliation);
 *   - `gas-seed-confirm` has no repeatable and needs none — it resolves itself
 *     by marking the grant `unresolved` once it is older than the shared
 *     give-up window, well before its attempts run out.
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
import { buildProcessors } from '@server/queue/workers/processors'
import { RECONCILE_INTERVAL_MS } from '@server/queue/jobs/reconcile-escrows'

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
  'sweep-escrows': 1, // one chain write at a time; the relayer nonce is serial
  reconcile: 1,
  'reconcile-fiat': 1,
  'expire-fiat-quotes': 1,
  'update-price-stats': 1,
  'prune-notifications': 1,
  'prune-stale-drafts': 1,
  'prune-auth-otps': 1,
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
  // ONE. Claims cluster — a push, a launch, a tweet — and every send on a chain
  // is signed by the SAME hot wallet, so two in flight race for one nonce and
  // the loser's broadcast is refused. Auto-send (#53a) could leave this
  // unserialised because signups arrive spread out; claims do not.
  //
  // One worker for the queue rather than one per chain: BullMQ concurrency is
  // per queue, and the seed is rare enough that serialising ACROSS chains costs
  // nothing worth a queue per chain.
  'gas-seed': 1,
  // FOUR, and deliberately not one (#58). Confirmation neither signs nor spends:
  // it is a read against a chain, so it has no nonce to race and nothing to
  // serialise. It is also the queue that WAITS — a transfer can stay unconfirmed
  // for hours — and at concurrency 1 a single slow chain would hold the only
  // slot and delay every other user's confirmation behind it.
  'gas-seed-confirm': 4,
  // One, like every repeatable: the handler walks a handful of chains
  // sequentially and a second tick overlapping the first would read the same
  // wallets and enqueue the same deduped alert.
  'gas-seed-balance-check': 1,
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
  // Slower than the notices it follows: nothing becomes sweepable inside a
  // minute (the first-refusal delay is a day), and every tick that finds work
  // spends real gas.
  repeatable({ name: 'sweep-escrows', every_ms: 15 * 60_000, payload: { tick_id: 'cron' } }),
  repeatable({ name: 'reconcile', every_ms: RECONCILE_INTERVAL_MS, payload: {} }),
  repeatable({ name: 'reconcile-fiat', every_ms: 5 * 60_000, payload: { tick_id: 'cron' } }),
  repeatable({ name: 'expire-fiat-quotes', every_ms: 60_000, payload: { tick_id: 'cron' } }),
  // Nightly rollup (stage-6): grounds the moderation price-sanity prompts.
  repeatable({ name: 'update-price-stats', every_ms: 24 * 3_600_000, payload: { tick_id: 'cron' } }),
  // Daily retention sweep: prunes stale personal notifications (unbounded growth).
  repeatable({ name: 'prune-notifications', every_ms: 24 * 3_600_000, payload: { tick_id: 'cron' } }),
  // Daily: a draft is abandoned over days, not minutes, and each tick is a bounded scan.
  repeatable({ name: 'prune-stale-drafts', every_ms: 24 * 3_600_000, payload: { tick_id: 'cron' } }),
  // Daily: spent codes only stop mattering once they are older than the send limits' longest window.
  repeatable({ name: 'prune-auth-otps', every_ms: 24 * 3_600_000, payload: { tick_id: 'cron' } }),
  // Every 15 minutes: a hot wallet drains in claims, not in seconds, and the
  // ALERT's own dedup — keyed on the chain alone — is what decides how often an
  // operator actually hears about it, so a brisk tick costs one RPC read per
  // seeded chain rather than one notice.
  repeatable({
    name: 'gas-seed-balance-check',
    every_ms: 15 * 60_000,
    payload: { tick_id: 'cron' },
  }),
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
      // RetryableError exhausting attempts is expected for slow chains, and
      // each queue has its own answer for what happens next (see the header) —
      // so this says what was observed and leaves the recovery unnamed. It used
      // to assert "deferred to reconcile", which was true of verify-tx and
      // false the moment a second queue started throwing the same signal.
      // Anything else deserves a louder line.
      if (err.name === 'RetryableError') {
        fastify.log.info(
          { queue: name, job_id: job?.id, attempts: job?.attemptsMade },
          'worker: job retried (tx not yet confirmed)',
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
