/**
 * BullMQ + Redis queue plugin — the typed producer surface. Workers and their
 * concurrency live in plugins/workers.ts, processors in workers/processors.ts;
 * both key off `JobName` from here, so this module decides what queues exist.
 *
 * Without `REDIS_URL` the plugin degrades to a stub whose `enqueue` throws
 * `INTERNAL_ERROR` (501), so call sites fail loud instead of silently dropping
 * jobs. Callers that treat enqueueing as best-effort (webhooks log + continue,
 * reconcile covers the gap) already handle that.
 *
 * Adding a new queue: add ONE entry to `JobPayload` (./payloads). `JobName`
 * derives from it, so the name, the worker concurrency map and the processor
 * map all fail to compile until they account for it. TypeScript exhaustiveness
 * ensures callers can't enqueue an unknown queue.
 *
 * Was one 411-line file. Split at the seams the sections already drew —
 * ./payloads is what the queues carry, ./connection where they live,
 * ./options how their jobs behave, and this file the plugin that puts the
 * three together. The `@server/plugins/queue` import path is unchanged for
 * every consumer, which is why this barrel exists at all.
 *
 * Named re-exports, not `export *`, matching features/alerts/types: `export
 * type` marks what is erased and `export` what survives to runtime, and no
 * `__exportStar` loop is emitted. The erasure is load-bearing here — see the
 * cycle note in ./payloads.
 */

import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { Queue } from 'bullmq'
import { AppError } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'
import { getConfig } from '@server/config'
import { queueConnectionOptions, queueName } from './connection'
import { queueOptions, resolveJobId, toJobOptions } from './options'
import type { BulkJob, EnqueueOptions } from './options'
import type { JobName, JobPayload } from './payloads'

export { QUEUE_PREFIX, queueConnectionOptions, queueName } from './connection'
export type { QueueConnectionOptions } from './connection'

export {
  DEFAULT_JOB_OPTIONS,
  VERIFY_TX_JOB_OPTIONS,
  queueOptions,
  resolveJobId,
  toJobOptions,
} from './options'
export type { BulkJob, BullJobOptions, EnqueueOptions } from './options'

export type { JobName, JobPayload } from './payloads'

// ---------- public surface ----------------------------------------------

export interface QueueService {
  enqueue<N extends JobName>(
    name: N,
    payload: JobPayload[N],
    opts?: EnqueueOptions,
  ): Promise<{ job_id: string }>
  /**
   * Many jobs onto ONE queue in a single pipelined round trip.
   *
   * The cost this exists to remove is N × RTT, not CPU: against LOCAL Redis
   * (~0 RTT) 500 jobs measured 201/300/242 ms sequentially against 33/44/46 ms
   * bulk over three runs — 5–7x. The gap widens with every millisecond of real
   * network latency, because the sequential path pays the round trip once per
   * job and this pays it once.
   *
   * NOT a transaction, and the distinction is load-bearing for callers: BullMQ's
   * `addBulk` uses a Redis PIPELINE (`Job.createBulk` → `client.pipeline()`),
   * which batches round trips without atomicity. A failure part-way still
   * leaves some jobs enqueued — the same guarantee the sequential loop gave,
   * neither better nor worse. Anything needing all-or-nothing has to be settled
   * before the call, not by it.
   */
  enqueueMany<N extends JobName>(
    name: N,
    jobs: readonly BulkJob<N>[],
  ): Promise<{ job_ids: string[] }>
}

// ---------- plugin -------------------------------------------------------

const queuePlugin: FastifyPluginAsync = async (fastify) => {
  const { REDIS_URL } = getConfig()

  if (REDIS_URL === null) {
    // Degrade exactly as before #33: enqueue 501s; callers already treat
    // it as best-effort (webhooks log + continue, reconcile covers).
    const stub: QueueService = {
      async enqueue(name, _payload, _opts) {
        throw new AppError(
          501,
          ErrorCode.INTERNAL_ERROR,
          `queue.enqueue('${name}'): REDIS_URL not configured`,
        )
      },
      // Mirrors `enqueue`: any call is a call that needed Redis. Producers with
      // nothing to send return before they get here — `enqueueNotificationToMany`
      // does exactly that — so this stays a loud failure rather than a
      // conditional one.
      async enqueueMany(name, _jobs) {
        throw new AppError(
          501,
          ErrorCode.INTERNAL_ERROR,
          `queue.enqueueMany('${name}'): REDIS_URL not configured`,
        )
      },
    }
    fastify.decorate('queue', stub)
    return
  }

  const connection = queueConnectionOptions(REDIS_URL)
  const queues = new Map<JobName, Queue>()

  function queueFor(name: JobName): Queue {
    let q = queues.get(name)
    if (q === undefined) {
      q = new Queue(queueName(name), queueOptions(connection, name))
      queues.set(name, q)
    }
    return q
  }

  const queue: QueueService = {
    async enqueue(name, payload, opts) {
      const job = await queueFor(name).add(name, payload, toJobOptions(opts))
      return { job_id: resolveJobId(job.id, opts) }
    },
    async enqueueMany(name, jobs) {
      // Today's only caller returns before it gets here with nothing to send
      // (lib/notify/), so this is defence rather than a live path — but it is
      // the cheap kind: `addBulk([])` is a Redis round trip whose only possible
      // answer is [], and skipping it also avoids constructing the Queue (and
      // its connection) for a call that enqueues nothing.
      if (jobs.length === 0) return { job_ids: [] }
      const added = await queueFor(name).addBulk(
        jobs.map((job) => ({ name, data: job.payload, opts: toJobOptions(job.opts) })),
      )
      // `added` is index-aligned with `jobs` (BullMQ builds its instances by
      // mapping the input in order), so the fallback can name the id THIS job
      // asked for rather than some other job's.
      return { job_ids: added.map((job, i) => resolveJobId(job.id, jobs[i].opts)) }
    },
  }
  fastify.decorate('queue', queue)

  fastify.addHook('onClose', async () => {
    await Promise.allSettled([...queues.values()].map((q) => q.close()))
  })
}

export default fp(queuePlugin, { name: 'queue' })
