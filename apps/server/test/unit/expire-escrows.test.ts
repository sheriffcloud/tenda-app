/**
 * jobs/expire-escrows — windowed nudge handler.
 *
 * Idempotency model under test: bounded lookback window + deterministic
 * notification job_id. An unbounded scan would re-notify on every tick
 * once BullMQ prunes the completed notification job.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  EXPIRE_BATCH_LIMIT,
  EXPIRE_LOOKBACK_MS,
  expireNoticeJobId,
  stalledNoticeJobId,
  handleExpireEscrows,
  type ExpireEscrowsDeps,
  type ExpiredOpenEscrow,
  type StalledAcceptedEscrow,
} from '@server/jobs/expire-escrows'
import type { JobPayload } from '@server/plugins/queue'
import { queueDouble, type CapturedJob, type QueueDouble } from '../helpers/queue-double'

const NOW = new Date('2026-06-04T12:00:00Z')

/**
 * The notification jobs, each with the dedup key it was enqueued under.
 *
 * Replaces a hand-rolled stub that pushed `payload as JobPayload['notifications']`.
 * That cast asserted the very thing this suite is checking — that the handler
 * enqueues onto the notifications queue — so a handler that started enqueuing
 * somewhere else would have had its payload recorded here as a notification and
 * every assertion below would have kept passing.
 *
 * Payload and job_id are projected TOGETHER rather than read from two lists,
 * because the ids are asserted positionally: pairing them here means the index
 * cannot drift if the handler ever enqueues onto a second queue.
 *
 * Named for what it adds over the helper's own `notificationsOf`, which returns
 * bare payloads: this is the `alertsOf` shape — the job, not just its contents.
 * Takes a call list rather than the double, so it matches the signature of both
 * helpers a reader already knows.
 *
 * Local rather than lifted into helpers/queue-double.ts: the generic
 * `jobsOf(calls, name)` that would let one function serve every queue does not
 * compile, because `c.name === name` does not narrow while `name` is a type
 * parameter (re-checked against the current tsc — `JobPayload[N]` resolves to
 * `never`). It can be made to compile with a type predicate, but a predicate
 * TypeScript cannot verify is exactly as unsound as the cast this task removes,
 * and it would put that unsoundness in the shared helper. Comparing against a
 * LITERAL here narrows for real, so these stay small, duplicated and sound.
 */
function notificationJobsOf(calls: readonly CapturedJob[]): {
  payload: JobPayload['notifications']
  job_id?: string
}[] {
  return calls.flatMap((c) =>
    c.name === 'notifications' ? [{ payload: c.payload, job_id: c.opts?.job_id }] : [],
  )
}

const GRACE_SECONDS = 3_600

interface Query {
  since: Date
  until: Date
  limit: number
  grace_period_seconds?: number
}

function makeDeps(
  rows: ExpiredOpenEscrow[],
  stalledRows: StalledAcceptedEscrow[] = [],
): {
  deps: ExpireEscrowsDeps
  queue: QueueDouble
  warns: string[]
  queried: Query[]
  stalledQueried: Query[]
} {
  const queue = queueDouble()
  const warns: string[] = []
  const queried: Query[] = []
  const stalledQueried: Query[] = []
  const deps: ExpireEscrowsDeps = {
    store: {
      async findNewlyExpiredOpen(since, until, limit) {
        queried.push({ since, until, limit })
        return rows
      },
      async findNewlyStalledAccepted(since, until, limit, grace_period_seconds) {
        stalledQueried.push({ since, until, limit, grace_period_seconds })
        return stalledRows
      },
    },
    queue,
    log: {
      info() {},
      warn(_obj, msg) {
        warns.push(msg)
      },
    },
    now: () => NOW,
    grace_period_seconds: GRACE_SECONDS,
  }
  return { deps, queue, warns, queried, stalledQueried }
}

function row(over: Partial<ExpiredOpenEscrow> = {}): ExpiredOpenEscrow {
  return { id: 'e-1', kind: 'gig', creator_id: 'u-1', ...over }
}

const TICK: JobPayload['expire-escrows'] = { tick_id: 't-1' }

test('queries the bounded lookback window ending at now', async () => {
  const { deps, queried } = makeDeps([])
  await handleExpireEscrows(deps, TICK)
  assert.strictEqual(queried.length, 1)
  assert.strictEqual(queried[0].until.getTime(), NOW.getTime())
  assert.strictEqual(queried[0].since.getTime(), NOW.getTime() - EXPIRE_LOOKBACK_MS)
  assert.strictEqual(queried[0].limit, EXPIRE_BATCH_LIMIT)
})

test('enqueues one creator nudge per expired escrow with deterministic job_id', async () => {
  const rows = [row(), row({ id: 'e-2', kind: 'exchange', creator_id: 'u-2' })]
  const { deps, queue } = makeDeps(rows)
  const result = await handleExpireEscrows(deps, TICK)
  const calls = notificationJobsOf(queue.calls)

  assert.deepStrictEqual(result, { scanned: 2, enqueued: 2 })
  assert.strictEqual(calls.length, 2)
  // Both counts, not just the projected one: `notificationJobsOf` FILTERS, so on
  // its own it reports 2 whether the handler enqueued two notifications or two
  // notifications plus something onto a queue nobody here reads.
  assert.strictEqual(queue.calls.length, 2)
  assert.strictEqual(calls[0].payload.user_id, 'u-1')
  assert.strictEqual(calls[0].job_id, expireNoticeJobId('e-1'))
  // Canonical deep-link data (shared escrowPushData) so the persisted expiry
  // notice is tappable → /gig/:id vs /exchange/:id on `kind`.
  assert.strictEqual(calls[0].payload.data?.screen, 'escrow')
  assert.strictEqual(calls[0].payload.data?.escrowId, 'e-1')
  assert.strictEqual(calls[0].payload.data?.kind, 'gig')
  // enqueueNotification stamps an id and persists the expiry notice.
  assert.strictEqual(typeof calls[0].payload.id, 'string')
  assert.strictEqual(calls[0].payload.persist, true)
  // Kind-specific copy.
  assert.match(calls[0].payload.title, /gig/i)
  assert.match(calls[1].payload.title, /exchange/i)
})

test('empty window → no enqueues, no warning', async () => {
  const { deps, queue, warns } = makeDeps([])
  const result = await handleExpireEscrows(deps, TICK)
  assert.deepStrictEqual(result, { scanned: 0, enqueued: 0 })
  // The TOTAL, so "enqueued nothing" cannot be satisfied by enqueueing
  // something this suite does not project.
  assert.strictEqual(queue.calls.length, 0)
  assert.strictEqual(warns.length, 0)
})

test('full batch → overflow warning (no silent cap)', async () => {
  const rows = Array.from({ length: EXPIRE_BATCH_LIMIT }, (_, i) =>
    row({ id: `e-${i}`, creator_id: `u-${i}` }),
  )
  const { deps, warns } = makeDeps(rows)
  const result = await handleExpireEscrows(deps, TICK)
  assert.strictEqual(result.enqueued, EXPIRE_BATCH_LIMIT)
  assert.strictEqual(warns.length, 1)
  assert.match(warns[0], /batch limit/)
})

test('expireNoticeJobId is stable per escrow (dedup key)', () => {
  assert.strictEqual(expireNoticeJobId('abc'), expireNoticeJobId('abc'))
  assert.notStrictEqual(expireNoticeJobId('abc'), expireNoticeJobId('def'))
})

// ---------- stalled-accepted scan -------------------------------------------
// The second deadline crossing: accepted, but completion_deadline + grace
// passed with no submission. Only the creator can act (reclaim_abandoned), so
// only the creator is nudged.

function stalled(over: Partial<StalledAcceptedEscrow> = {}): StalledAcceptedEscrow {
  return { id: 's-1', kind: 'gig', creator_id: 'c-1', ...over }
}

test('stalled scan shares the tick window and passes the injected grace period', async () => {
  const { deps, stalledQueried } = makeDeps([])
  await handleExpireEscrows(deps, TICK)
  assert.strictEqual(stalledQueried.length, 1)
  assert.strictEqual(stalledQueried[0].until.getTime(), NOW.getTime())
  assert.strictEqual(stalledQueried[0].since.getTime(), NOW.getTime() - EXPIRE_LOOKBACK_MS)
  assert.strictEqual(stalledQueried[0].limit, EXPIRE_BATCH_LIMIT)
  assert.strictEqual(stalledQueried[0].grace_period_seconds, GRACE_SECONDS)
})

test('nudges the creator of a stalled escrow with its own deterministic job_id', async () => {
  const { deps, queue } = makeDeps([], [stalled()])
  const result = await handleExpireEscrows(deps, TICK)
  const calls = notificationJobsOf(queue.calls)

  assert.deepStrictEqual(result, { scanned: 1, enqueued: 1 })
  assert.strictEqual(calls.length, 1)
  assert.strictEqual(queue.calls.length, 1)
  assert.strictEqual(calls[0].payload.user_id, 'c-1')
  assert.strictEqual(calls[0].job_id, stalledNoticeJobId('s-1'))
  assert.strictEqual(calls[0].payload.data?.escrowId, 's-1')
  assert.strictEqual(calls[0].payload.persist, true)
})

test('stalled copy is kind-specific and distinct from the expiry copy', async () => {
  const { deps, queue } = makeDeps([], [stalled(), stalled({ id: 's-2', kind: 'exchange' })])
  await handleExpireEscrows(deps, TICK)
  const calls = notificationJobsOf(queue.calls)
  assert.match(calls[0].payload.title, /gig/i)
  assert.match(calls[1].payload.title, /trade/i)
  // "not delivered" / "not completed", never the "expired" wording — a poster
  // whose worker vanished did not have an unaccepted gig.
  assert.doesNotMatch(calls[0].payload.title, /expired/i)
})

test('the two notice id spaces never collide for the same escrow', () => {
  assert.notStrictEqual(expireNoticeJobId('x'), stalledNoticeJobId('x'))
  assert.strictEqual(stalledNoticeJobId('x'), stalledNoticeJobId('x'))
})

test('both scans report in one tick result', async () => {
  const { deps, queue } = makeDeps([row(), row({ id: 'e-2' })], [stalled()])
  const result = await handleExpireEscrows(deps, TICK)
  const calls = notificationJobsOf(queue.calls)
  assert.deepStrictEqual(result, { scanned: 3, enqueued: 3 })
  assert.deepStrictEqual(
    calls.map((c) => c.job_id),
    [expireNoticeJobId('e-1'), expireNoticeJobId('e-2'), stalledNoticeJobId('s-1')],
  )
})

test('a full stalled batch warns independently of the expiry scan', async () => {
  const rows = Array.from({ length: EXPIRE_BATCH_LIMIT }, (_, i) => stalled({ id: `s-${i}` }))
  const { deps, warns } = makeDeps([], rows)
  const result = await handleExpireEscrows(deps, TICK)
  assert.strictEqual(result.enqueued, EXPIRE_BATCH_LIMIT)
  assert.strictEqual(warns.length, 1)
  assert.match(warns[0], /batch limit/)
})

test('a full batch on BOTH scans warns twice', async () => {
  const expiredRows = Array.from({ length: EXPIRE_BATCH_LIMIT }, (_, i) => row({ id: `e-${i}` }))
  const stalledRows = Array.from({ length: EXPIRE_BATCH_LIMIT }, (_, i) => stalled({ id: `s-${i}` }))
  const { deps, warns } = makeDeps(expiredRows, stalledRows)
  await handleExpireEscrows(deps, TICK)
  assert.strictEqual(warns.length, 2)
})
