/**
 * prune-stale-drafts — the job's own decisions, with the DELETE behind a port:
 * the cutoff it derives from the retention setting, how many statements it runs,
 * and when it stops. What a statement may and may not delete is
 * test/integration/stale-drafts.test.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import {
  PRUNE_STALE_DRAFTS_BATCH,
  PRUNE_STALE_DRAFTS_MAX_BATCHES,
  handlePruneStaleDrafts,
  type PruneStaleDraftsDeps,
} from '@server/queue/jobs/prune-stale-drafts'

const NOW = new Date('2026-10-10T12:00:00Z')
const DAY = 24 * 3_600_000

function harness(replies: number[], over: Partial<PruneStaleDraftsDeps> = {}) {
  const calls: Array<{ older_than: Date; limit: number }> = []
  const logs: Array<{ level: 'info' | 'warn'; obj: object }> = []
  const deps: PruneStaleDraftsDeps = {
    discardStale: async (args) => {
      calls.push(args)
      return replies[calls.length - 1] ?? 0
    },
    retention_days: 7,
    now: () => NOW,
    log: {
      info: (obj) => logs.push({ level: 'info', obj }),
      warn: (obj) => logs.push({ level: 'warn', obj }),
    },
    ...over,
  }
  return { deps, calls, logs }
}

test('the cutoff is now minus the retention days, handed to every statement with the batch size', async () => {
  const { deps, calls } = harness([3])
  await handlePruneStaleDrafts(deps)
  assert.deepStrictEqual(calls, [{ older_than: new Date(NOW.getTime() - 7 * DAY), limit: PRUNE_STALE_DRAFTS_BATCH }])
})

test('the retention setting moves the cutoff: 1 day and 30 days differ by exactly 29 days', async () => {
  const short = harness([0], { retention_days: 1 })
  const long = harness([0], { retention_days: 30 })
  await handlePruneStaleDrafts(short.deps)
  await handlePruneStaleDrafts(long.deps)
  assert.strictEqual(short.calls[0].older_than.getTime() - long.calls[0].older_than.getTime(), 29 * DAY)
})

test('a short batch ends the tick: one statement, and the total is that statement\'s', async () => {
  const { deps, calls } = harness([PRUNE_STALE_DRAFTS_BATCH - 1])
  assert.deepStrictEqual(await handlePruneStaleDrafts(deps), { pruned: PRUNE_STALE_DRAFTS_BATCH - 1 })
  assert.strictEqual(calls.length, 1)
})

test('full batches keep going until one comes back short, and the total is the sum', async () => {
  const { deps, calls } = harness([PRUNE_STALE_DRAFTS_BATCH, PRUNE_STALE_DRAFTS_BATCH, 7])
  assert.deepStrictEqual(await handlePruneStaleDrafts(deps), { pruned: 2 * PRUNE_STALE_DRAFTS_BATCH + 7 })
  assert.strictEqual(calls.length, 3)
})

test('a backlog past the ceiling stops at the ceiling and says the rest waits for the next tick', async () => {
  const { deps, calls, logs } = harness(Array(PRUNE_STALE_DRAFTS_MAX_BATCHES + 5).fill(PRUNE_STALE_DRAFTS_BATCH))
  const result = await handlePruneStaleDrafts(deps)
  assert.strictEqual(calls.length, PRUNE_STALE_DRAFTS_MAX_BATCHES)
  assert.strictEqual(result.pruned, PRUNE_STALE_DRAFTS_MAX_BATCHES * PRUNE_STALE_DRAFTS_BATCH)
  assert.ok(logs.some((l) => l.level === 'warn'), 'a capped tick must warn')
})

test('an empty tick is silent: no info, no warning', async () => {
  const { deps, logs } = harness([0])
  assert.deepStrictEqual(await handlePruneStaleDrafts(deps), { pruned: 0 })
  assert.deepStrictEqual(logs, [])
})

test('a tick that discarded something logs the count and the retention it applied', async () => {
  const { deps, logs } = harness([4])
  await handlePruneStaleDrafts(deps)
  assert.deepStrictEqual(logs, [{ level: 'info', obj: { pruned: 4, retention_days: 7 } }])
})

test('exactly one full batch followed by an empty one is drained, not capped', async () => {
  const { deps, calls, logs } = harness([PRUNE_STALE_DRAFTS_BATCH, 0])
  await handlePruneStaleDrafts(deps)
  assert.strictEqual(calls.length, 2)
  assert.ok(!logs.some((l) => l.level === 'warn'))
})

test('a failing statement propagates, so BullMQ records the failure instead of the job reporting success', async () => {
  const { deps } = harness([], {
    discardStale: async () => {
      throw new Error('db down')
    },
  })
  await assert.rejects(handlePruneStaleDrafts(deps), /db down/)
})
