/**
 * jobs/expire-applications — the sweep is a TIDIER, not a gate.
 *
 * `isAssignable` already refuses a lapsed application the moment its deadline
 * passes, so a missed tick can never let a stale row be assigned. What these
 * pin is that the sweep stays bounded and stays quiet when there is nothing
 * to do — it runs every minute.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  EXPIRE_APPLICATIONS_BATCH,
  expireApplicationsHandler,
} from '@server/jobs/expire-applications'

const NOW = new Date('2026-07-01T12:00:00Z')

function deps(expired: number) {
  const calls: Array<{ now: Date; limit: number }> = []
  const logged: Array<Record<string, unknown>> = []
  return {
    calls,
    logged,
    deps: {
      store: {
        async expireDue(now: Date, limit: number) {
          calls.push({ now, limit })
          return expired
        },
      },
      now: () => NOW,
      log: { info: (obj: Record<string, unknown>) => logged.push(obj) },
    },
  }
}

test('sweeps with the job clock and a bounded batch', async () => {
  const { deps: d, calls } = deps(3)
  const result = await expireApplicationsHandler(d)
  assert.deepStrictEqual(result, { expired: 3 })
  assert.deepStrictEqual(calls, [{ now: NOW, limit: EXPIRE_APPLICATIONS_BATCH }])
})

// A minute-by-minute job whose empty ticks logged would bury everything else.
test('an empty tick logs nothing', async () => {
  const { deps: d, logged } = deps(0)
  const result = await expireApplicationsHandler(d)
  assert.deepStrictEqual(result, { expired: 0 })
  assert.strictEqual(logged.length, 0)
})

test('a productive tick reports the count', async () => {
  const { deps: d, logged } = deps(7)
  await expireApplicationsHandler(d)
  assert.deepStrictEqual(logged, [{ expired: 7 }])
})

// The batch bounds one tick's work; a backlog drains across ticks rather than
// holding a long transaction open.
test('the batch is bounded and positive', () => {
  assert.ok(EXPIRE_APPLICATIONS_BATCH > 0)
  assert.ok(EXPIRE_APPLICATIONS_BATCH <= 1000)
})
