/**
 * Redis-gated integration: real BullMQ producer → worker round-trip,
 * retry-on-RetryableError behavior, and scheduler upsert idempotency.
 *
 * SKIPS unless REDIS_URL is set (CI runs offline; locally the dev
 * container from docker-compose.dev.yml satisfies it):
 *
 *   REDIS_URL=redis://localhost:6379 npx tsx --test test/integration/bullmq.test.ts
 *
 * Uses throwaway queue names so it never touches the app's queues.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { Queue, Worker } from 'bullmq'
import { queueConnectionOptions, queueOptions } from '@server/plugins/queue'

const REDIS_URL = process.env.REDIS_URL
const gated = REDIS_URL === undefined ? test.skip : test

function conn() {
  return queueConnectionOptions(REDIS_URL ?? 'redis://unused')
}

gated('producer → worker round-trip delivers the payload exactly once', async () => {
  const name = `tenda-test-${randomUUID()}`
  const queue = new Queue(name, { connection: conn() })
  const seen: unknown[] = []

  const worker = new Worker(
    name,
    async (job) => {
      seen.push(job.data)
    },
    { connection: conn() },
  )

  try {
    await queue.add('t', { hello: 'world' }, { jobId: 'fixed-id' })
    // Same jobId while the first is pending/active → deduped.
    await queue.add('t', { hello: 'duplicate' }, { jobId: 'fixed-id' })

    const deadline = Date.now() + 10_000
    while (seen.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100))
    }
    // Allow a beat for any (incorrect) second delivery to surface.
    await new Promise((r) => setTimeout(r, 300))

    assert.deepStrictEqual(seen, [{ hello: 'world' }])
  } finally {
    await worker.close()
    await queue.obliterate({ force: true })
    await queue.close()
  }
})

gated('RetryableError-style failures retry on backoff until attempts exhaust', async () => {
  const name = `tenda-test-${randomUUID()}`
  const queue = new Queue(name, { connection: conn() })
  let calls = 0

  const worker = new Worker(
    name,
    async () => {
      calls += 1
      const err = new Error('not_yet_confirmed')
      err.name = 'RetryableError'
      throw err
    },
    { connection: conn() },
  )

  try {
    await queue.add('t', {}, { attempts: 3, backoff: { type: 'fixed', delay: 100 } })
    const deadline = Date.now() + 10_000
    while (calls < 3 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100))
    }
    assert.strictEqual(calls, 3)
    const failed = await queue.getFailedCount()
    assert.strictEqual(failed, 1)
  } finally {
    await worker.close()
    await queue.obliterate({ force: true })
    await queue.close()
  }
})

gated('verify-tx reconciliation can execute the same id after attempts exhaust', async () => {
  const name = `tenda-test-${randomUUID()}`
  const queue = new Queue(name, queueOptions(conn(), 'verify-tx'))
  let calls = 0
  let shouldFail = true
  const worker = new Worker(
    name,
    async () => {
      calls += 1
      if (shouldFail) throw new Error('not_yet_confirmed')
    },
    { connection: conn() },
  )

  try {
    await queue.add('verify-tx', {}, { jobId: 'same-tx', attempts: 1 })
    const failureDeadline = Date.now() + 10_000
    while (calls < 1 && Date.now() < failureDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.strictEqual(calls, 1)
    shouldFail = false
    await queue.add('verify-tx', {}, { jobId: 'same-tx', attempts: 1 })
    const retryDeadline = Date.now() + 10_000
    while (calls < 2 && Date.now() < retryDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.strictEqual(calls, 2)
  } finally {
    await worker.close()
    await queue.obliterate({ force: true })
    await queue.close()
  }
})

gated('scheduler upsert is idempotent across re-registration (boot pattern)', async () => {
  const name = `tenda-test-${randomUUID()}`
  const queue = new Queue(name, { connection: conn() })
  try {
    await queue.upsertJobScheduler('sched:x', { every: 60_000 }, { name: 'tick', data: {} })
    await queue.upsertJobScheduler('sched:x', { every: 60_000 }, { name: 'tick', data: {} })
    const schedulers = await queue.getJobSchedulers()
    assert.strictEqual(schedulers.length, 1)
  } finally {
    await queue.obliterate({ force: true })
    await queue.close()
  }
})
