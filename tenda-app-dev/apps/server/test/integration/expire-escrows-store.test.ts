/**
 * jobs/expire-escrows — the REAL Drizzle queries against Postgres.
 *
 * test/unit/expire-escrows.test.ts drives the handler through a fake store, so
 * it verifies the windowing and idempotency logic but never executes SQL. That
 * blind spot is not theoretical: the first cut of `findNewlyStalledAccepted`
 * used a raw `sql` fragment with a bound Date, which postgres-js cannot
 * serialise, and the unit suite stayed green. These tests exercise the drivers.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { drizzleExpireEscrowsStore, EXPIRE_BATCH_LIMIT } from '@server/jobs/expire-escrows'
import {
  TEST_DB_CONFIGURED, useTestApp, createUser, createEscrow,
  type TestUser,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const GRACE_SECONDS = 3_600
const GRACE_MS = GRACE_SECONDS * 1_000
const MINUTE = 60_000

type App = ReturnType<typeof getApp>

const UNTIL = new Date('2026-06-04T12:00:00.000Z')
const SINCE = new Date(UNTIL.getTime() - 5 * MINUTE)

function store(app: App) {
  return drizzleExpireEscrowsStore(app.db)
}

async function ids(rows: Promise<{ id: string }[]>): Promise<string[]> {
  return (await rows).map((r) => r.id)
}

// ---------- findNewlyExpiredOpen ---------------------------------------------

test('expired-open: finds an unaccepted open escrow whose deadline crossed in-window', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const inside = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    accept_deadline: new Date(UNTIL.getTime() - MINUTE),
  })
  const found = await ids(store(app).findNewlyExpiredOpen(SINCE, UNTIL, EXPIRE_BATCH_LIMIT))
  assert.ok(found.includes(inside.id))
})

test('expired-open: ignores deadlines outside the window on both sides', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const tooOld = await createEscrow(app, {
    creator_id: creator.row.id, status: 'open',
    accept_deadline: new Date(SINCE.getTime() - MINUTE),
  })
  const notYet = await createEscrow(app, {
    creator_id: creator.row.id, status: 'open',
    accept_deadline: new Date(UNTIL.getTime() + MINUTE),
  })
  const found = await ids(store(app).findNewlyExpiredOpen(SINCE, UNTIL, EXPIRE_BATCH_LIMIT))
  assert.ok(!found.includes(tooOld.id))
  assert.ok(!found.includes(notYet.id))
})

test('expired-open: ignores an escrow that was accepted (counterparty set)', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const taken = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'open',
    accept_deadline: new Date(UNTIL.getTime() - MINUTE),
  })
  const found = await ids(store(app).findNewlyExpiredOpen(SINCE, UNTIL, EXPIRE_BATCH_LIMIT))
  assert.ok(!found.includes(taken.id))
})

test('expired-open: ignores non-open statuses', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const cancelled = await createEscrow(app, {
    creator_id: creator.row.id, status: 'cancelled',
    accept_deadline: new Date(UNTIL.getTime() - MINUTE),
  })
  const found = await ids(store(app).findNewlyExpiredOpen(SINCE, UNTIL, EXPIRE_BATCH_LIMIT))
  assert.ok(!found.includes(cancelled.id))
})

// ---------- findNewlyStalledAccepted ----------------------------------------

/** Accepted escrow whose submit window closes at `windowEnd`. */
async function acceptedClosingAt(app: App, worker: TestUser, windowEnd: Date) {
  const creator = await createUser(app)
  return createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'accepted',
    completion_deadline: new Date(windowEnd.getTime() - GRACE_MS),
  })
}

test('stalled: finds an accepted escrow whose submit window closed in-window', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  const inside = await acceptedClosingAt(app, worker, new Date(UNTIL.getTime() - MINUTE))
  const found = await ids(
    store(app).findNewlyStalledAccepted(SINCE, UNTIL, EXPIRE_BATCH_LIMIT, GRACE_SECONDS),
  )
  assert.ok(found.includes(inside.id))
})

test('stalled: ignores submit windows outside the tick window on both sides', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  const tooOld = await acceptedClosingAt(app, worker, new Date(SINCE.getTime() - MINUTE))
  const notYet = await acceptedClosingAt(app, worker, new Date(UNTIL.getTime() + MINUTE))
  const found = await ids(
    store(app).findNewlyStalledAccepted(SINCE, UNTIL, EXPIRE_BATCH_LIMIT, GRACE_SECONDS),
  )
  assert.ok(!found.includes(tooOld.id))
  assert.ok(!found.includes(notYet.id))
})

test('stalled: the grace period shifts which escrows qualify', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  // Deadline chosen so the window closes in-tick under a 1h grace, but an hour
  // later — outside the tick — under a 2h grace. Pins the arithmetic that a
  // fake-store unit test cannot reach.
  const escrow = await acceptedClosingAt(app, worker, new Date(UNTIL.getTime() - MINUTE))

  const withGrace = await ids(
    store(app).findNewlyStalledAccepted(SINCE, UNTIL, EXPIRE_BATCH_LIMIT, GRACE_SECONDS),
  )
  const withDoubleGrace = await ids(
    store(app).findNewlyStalledAccepted(SINCE, UNTIL, EXPIRE_BATCH_LIMIT, GRACE_SECONDS * 2),
  )
  assert.ok(withGrace.includes(escrow.id))
  assert.ok(!withDoubleGrace.includes(escrow.id))
})

test('stalled: ignores a submitted escrow (the worker delivered)', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const submitted = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'submitted',
    completion_deadline: new Date(UNTIL.getTime() - MINUTE - GRACE_MS),
  })
  const found = await ids(
    store(app).findNewlyStalledAccepted(SINCE, UNTIL, EXPIRE_BATCH_LIMIT, GRACE_SECONDS),
  )
  assert.ok(!found.includes(submitted.id))
})

test('stalled: ignores an already-refunded escrow', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const refunded = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'refunded',
    completion_deadline: new Date(UNTIL.getTime() - MINUTE - GRACE_MS),
  })
  const found = await ids(
    store(app).findNewlyStalledAccepted(SINCE, UNTIL, EXPIRE_BATCH_LIMIT, GRACE_SECONDS),
  )
  assert.ok(!found.includes(refunded.id))
})

test('stalled: respects the row limit', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  for (let i = 0; i < 3; i += 1) {
    await acceptedClosingAt(app, worker, new Date(UNTIL.getTime() - MINUTE))
  }
  const found = await store(app).findNewlyStalledAccepted(SINCE, UNTIL, 2, GRACE_SECONDS)
  assert.strictEqual(found.length, 2)
})

test('stalled: returns the fields the notice builder needs', { skip }, async () => {
  const app = getApp()
  const worker = await createUser(app)
  const escrow = await acceptedClosingAt(app, worker, new Date(UNTIL.getTime() - MINUTE))
  const rows = await store(app).findNewlyStalledAccepted(SINCE, UNTIL, EXPIRE_BATCH_LIMIT, GRACE_SECONDS)
  const row = rows.find((r) => r.id === escrow.id)
  assert.ok(row !== undefined)
  assert.strictEqual(row.creator_id, escrow.creator_id)
  assert.strictEqual(row.kind, 'gig')
})
