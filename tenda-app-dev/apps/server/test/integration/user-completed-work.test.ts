/**
 * GET /v1/users/:id/completed-work — WHAT IT COUNTS.
 *
 * The property that matters most is not any single count: it is that this
 * endpoint and the "Completed" stat printed beside it on the same profile
 * describe the SAME population. `mine=working&status=completed` on /v1/gigs is
 * where that number comes from, so the tests below assert the chips SUM to
 * what that call reports rather than to a hand-counted constant — a constant
 * would still pass if the two predicates drifted apart.
 *
 * What is deliberately NOT counted lives in user-completed-work-excluded.test.ts.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEST_DB_CONFIGURED, useTestApp, createUser } from '../helpers/test-app'
import { openGig } from '../helpers/escrow-states'
import { completedStat, completedWork, sum, workedGig } from '../helpers/completed-work'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- the counts themselves ------------------------------------------

test('counts the categories worked, most delivered first', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  await workedGig(app, worker, 'delivery')
  await workedGig(app, worker, 'delivery')
  await workedGig(app, worker, 'delivery')
  await workedGig(app, worker, 'photo')
  await workedGig(app, worker, 'photo')
  await workedGig(app, worker, 'service')

  const data = await completedWork(app, worker.row.id)

  assert.deepEqual(data, [
    { category: 'delivery', count: 3 },
    { category: 'photo', count: 2 },
    { category: 'service', count: 1 },
  ])
})

test('a category with no work is ABSENT, not a zero', { skip }, async () => {
  // The block draws a chip per entry, so an entry with 0 would render "Errand 0"
  // on a profile where no errand was ever run. GigFacets is complete over its
  // vocabulary for the opposite reason; this one is not, on purpose.
  const app = getApp()
  const worker = await createUser(app)
  await workedGig(app, worker, 'digital')

  const data = await completedWork(app, worker.row.id)

  assert.deepEqual(data, [{ category: 'digital', count: 1 }])
  assert.equal(data.some((row) => row.count === 0), false)
})

test('a user who has completed nothing gets an EMPTY list, not zeros', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)

  assert.deepEqual(await completedWork(app, worker.row.id), [])
})

test('ties break by category, ascending', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  await workedGig(app, worker, 'service')
  await workedGig(app, worker, 'delivery')
  await workedGig(app, worker, 'photo')

  const first = await completedWork(app, worker.row.id)
  const second = await completedWork(app, worker.row.id)

  // Every count is 1, so the tiebreaker is the only thing that names an order
  // here — and reversing it to `desc` turns this red. What this canNOT prove is
  // that the clause is load-bearing: removing it entirely was measured to
  // return the same order on this data. So this pins the contract, and the
  // route's comment says so rather than claiming a bug was fixed.
  assert.deepEqual(first.map((row) => row.category), ['delivery', 'photo', 'service'])
  assert.deepEqual(first, second)
})

// ---------- agreement with the stat beside it -------------------------------

test('the chips sum to the profile Completed stat, across categories', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  await workedGig(app, worker, 'delivery')
  await workedGig(app, worker, 'photo')
  await workedGig(app, worker, 'photo')
  await workedGig(app, worker, 'errand')

  const data = await completedWork(app, worker.row.id)

  assert.equal(sum(data), 4)
  assert.equal(sum(data), await completedStat(app, worker))
})

test('a pending direct-offer assignee counts the same way the stat does', { skip }, async () => {
  // `mine=working` is isEscrowCounterpartySide — counterparty OR assignee — so
  // this endpoint has to be, or the two numbers part company on the one row
  // where they differ.
  const app = getApp()
  const worker = await createUser(app)
  const poster = await createUser(app)
  await openGig(app, {
    category: 'digital',
    escrow: {
      status: 'completed',
      creator_id: poster.row.id,
      counterparty_id: null,
      assigned_counterparty_id: worker.row.id,
    },
  })

  const data = await completedWork(app, worker.row.id)

  assert.equal(sum(data), await completedStat(app, worker))
  assert.deepEqual(data, [{ category: 'digital', count: 1 }])
})

