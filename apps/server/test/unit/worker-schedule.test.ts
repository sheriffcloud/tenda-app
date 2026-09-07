/**
 * Pins the periodic schedule (plugins/workers.ts REPEATABLES). A repeatable
 * handler once shipped fully unit-tested but unscheduled (the stage-6
 * price-stats rollup): the parts were green, nothing asserted the
 * composition. This test makes "implemented a periodic job" and "scheduled
 * it" fail together or pass together. Pure module import — no Redis/DB.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { REPEATABLES, WORKER_CONCURRENCY } from '@server/plugins/workers'
import type { JobName } from '@server/plugins/queue'

const byName = new Map(REPEATABLES.map((r) => [r.name as string, r]))

/**
 * Queues that are event-driven ON PURPOSE, each with what enqueues it.
 *
 * The list below and REPEATABLES must together cover every JobName. That is the
 * half this file was missing: the tests here pin the repeatables that ARE
 * listed, so removing one fails — but a NEW queue that should have been
 * scheduled and wasn't passed everything, which is exactly how the price-stats
 * rollup shipped unscheduled. Adding a queue now forces a decision here.
 */
const EVENT_DRIVEN: Partial<Record<JobName, string>> = {
  'verify-tx': 'enqueued per tx attempt by the client ping and the chain listeners',
  // "one job per recipient" until #26 — every fan-out now sends the whole
  // recipient list as ONE batched enqueue, and the job-per-recipient split
  // happens inside that call.
  notifications: 'enqueued by every fan-out, one batched job set per notice',
  'send-otp': 'enqueued by the auth challenge so the response never blocks on a provider',
  alerts: 'enqueued by the escrow fan-out when a dispute is raised on-chain',
  'fanout-subscribers':
    'enqueued by the escrow fan-out on escrow.created, one job per new gig',
}

test('the schedule contains exactly the known periodic jobs, each once', () => {
  const expected = [
    'expire-applications',
    'expire-escrows',
    'expire-fiat-quotes',
    'prune-notifications',
    'reconcile',
    'reconcile-fiat',
    'update-price-stats',
  ]
  assert.deepStrictEqual([...byName.keys()].sort(), expected)
  assert.strictEqual(REPEATABLES.length, byName.size, 'duplicate repeatable names')
})

test('cadences: expiries every 60s, reconciles every 5min, price stats nightly', () => {
  assert.strictEqual(byName.get('expire-escrows')?.every_ms, 60_000)
  assert.strictEqual(byName.get('expire-applications')?.every_ms, 60_000)
  assert.strictEqual(byName.get('expire-fiat-quotes')?.every_ms, 60_000)
  assert.strictEqual(byName.get('reconcile')?.every_ms, 5 * 60_000)
  assert.strictEqual(byName.get('reconcile-fiat')?.every_ms, 5 * 60_000)
  assert.strictEqual(byName.get('update-price-stats')?.every_ms, 24 * 3_600_000)
  assert.strictEqual(byName.get('prune-notifications')?.every_ms, 24 * 3_600_000)
})

test('every repeatable has a positive interval and an object payload', () => {
  for (const r of REPEATABLES) {
    assert.ok(r.every_ms > 0, `${r.name}: non-positive interval`)
    assert.strictEqual(typeof r.payload, 'object', `${r.name}: payload must be an object`)
  }
})

test('every queue is EITHER scheduled OR declared event-driven', () => {
  // The composition check the file's own docstring asks for, applied in the
  // direction that was open: not "is every repeatable listed" but "is every
  // queue accounted for". A queue in neither set has a worker consuming it and
  // nothing ever putting a job on it.
  for (const name of Object.keys(WORKER_CONCURRENCY) as JobName[]) {
    const scheduled = byName.has(name)
    const eventDriven = EVENT_DRIVEN[name] !== undefined
    assert.ok(
      scheduled || eventDriven,
      `${name} is neither scheduled nor declared event-driven — nothing will ever enqueue it`,
    )
    assert.ok(
      !(scheduled && eventDriven),
      `${name} is both scheduled and declared event-driven — say which`,
    )
  }
})

test('nothing is declared event-driven that does not exist as a queue', () => {
  // The inverse: a stale entry here would quietly excuse a queue that was
  // renamed or removed, and keep excusing its replacement.
  for (const name of Object.keys(EVENT_DRIVEN)) {
    assert.ok(name in WORKER_CONCURRENCY, `${name} is declared event-driven but is not a queue`)
  }
})
