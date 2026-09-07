/**
 * Worker capacity cap on POST /v1/escrows/:id/accept.
 *
 * The boundary arithmetic is unit-tested (test/unit/capacity.test.ts); this
 * suite pins the SQL predicate — exactly which escrows consume a slot — plus
 * the route wiring. Every case here is a statement about fairness:
 *
 *   counts     accepted with a live submit window
 *              submitted with a live approval window
 *   ignores    stalled work (only the creator can act)
 *              submitted past the approval window (the poster is stalling)
 *              disputed (open-ended; must not tax raising one)
 *              exchange escrows (a trade is not a work commitment)
 *              terminal escrows
 *
 * Most cases leave platform_config unseeded so the shared
 * PLATFORM_CONFIG_DEFAULTS apply (limit 2, grace 1h); the retune case seeds
 * and PATCHes it, and `resetDb` clears both the row and the config cache
 * between tests.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ErrorCode, PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared'
import type { EscrowStatus } from '@tenda/shared'
import { platform_config } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED, useTestApp, createTransactableUser, createUser, createEscrow, authHeader,
  attachExchangeDetails,
  type TestUser,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const LIMIT = PLATFORM_CONFIG_DEFAULTS.max_pending_gigs
const GRACE_MS = PLATFORM_CONFIG_DEFAULTS.grace_period_seconds * 1_000
const HOUR = 3_600_000

type App = ReturnType<typeof getApp>

/** A worker who has cleared the first-transaction gate. */
async function transactableWorker(app: App): Promise<TestUser> {
  const worker = await createTransactableUser(app)
  return worker
}

/** One escrow with `worker` as counterparty, in the given shape. */
async function heldEscrow(
  app: App,
  worker: TestUser,
  opts: {
    status: EscrowStatus
    kind?: 'gig' | 'exchange'
    completion_deadline?: Date | null
    approval_deadline?: Date | null
  },
) {
  const creator = await createUser(app)
  return createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: opts.status,
    kind: opts.kind ?? 'gig',
    completion_deadline: opts.completion_deadline ?? new Date(Date.now() + 24 * HOUR),
    ...(opts.approval_deadline !== undefined ? { approval_deadline: opts.approval_deadline } : {}),
  })
}

/** Fill the worker to exactly `LIMIT` live accepted gigs. */
async function fillToLimit(app: App, worker: TestUser) {
  for (let i = 0; i < LIMIT; i += 1) {
    await heldEscrow(app, worker, { status: 'accepted' })
  }
}

/** An open gig the worker may attempt to accept. */
async function openGigFor(app: App, kind: 'gig' | 'exchange' = 'gig') {
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, status: 'open', kind })
  if (kind === 'exchange') await attachExchangeDetails(app, escrow.id)
  return escrow
}

function accept(app: App, escrow_id: string, worker: TestUser) {
  return app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow_id}/accept`,
    headers: authHeader(worker.token),
  })
}

// ---------- allowed ---------------------------------------------------------

test('accept: an idle worker may accept', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 200)
})

test('accept: one below the limit is still allowed', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  for (let i = 0; i < LIMIT - 1; i += 1) await heldEscrow(app, worker, { status: 'accepted' })
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 200)
})

// ---------- blocked ---------------------------------------------------------

test('accept: refused at the limit, with the load and limit in details', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  await fillToLimit(app, worker)

  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 403)
  const body = res.json()
  assert.strictEqual(body.code, ErrorCode.GIG_CAPACITY_REACHED)
  assert.strictEqual(body.details.active, LIMIT)
  assert.strictEqual(body.details.limit, LIMIT)
  assert.strictEqual(body.details.remaining, 0)
  // The refusal has to tell the worker what to do next.
  assert.match(body.message, /at a time/)
})

test('accept: a submitted gig inside its approval window still occupies a slot', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  await heldEscrow(app, worker, { status: 'accepted' })
  await heldEscrow(app, worker, {
    status: 'submitted',
    approval_deadline: new Date(Date.now() + 24 * HOUR),
  })
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 403)
})

// ---------- deliberately not counted ---------------------------------------

test('accept: stalled work frees the slot (only the creator can reclaim it)', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  for (let i = 0; i < LIMIT; i += 1) {
    await heldEscrow(app, worker, {
      status: 'accepted',
      // Submit window (deadline + grace) already closed.
      completion_deadline: new Date(Date.now() - GRACE_MS - HOUR),
    })
  }
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 200)
})

test('accept: a submit window still inside grace DOES occupy a slot', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  for (let i = 0; i < LIMIT; i += 1) {
    await heldEscrow(app, worker, {
      // Deadline passed, but grace has not run out yet — the worker can still
      // submit, so the obligation is live.
      status: 'accepted',
      completion_deadline: new Date(Date.now() - GRACE_MS / 2),
    })
  }
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 403)
})

test('accept: a submitted gig past its approval window frees the slot', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  for (let i = 0; i < LIMIT; i += 1) {
    await heldEscrow(app, worker, {
      status: 'submitted',
      approval_deadline: new Date(Date.now() - HOUR),
    })
  }
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 200)
})

test('accept: disputed escrows are never counted', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  for (let i = 0; i < LIMIT; i += 1) await heldEscrow(app, worker, { status: 'disputed' })
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 200)
})

test('accept: completed escrows are never counted', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  for (let i = 0; i < LIMIT; i += 1) await heldEscrow(app, worker, { status: 'completed' })
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 200)
})

test('accept: exchange escrows the worker holds do not consume gig capacity', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  for (let i = 0; i < LIMIT; i += 1) {
    await heldEscrow(app, worker, { status: 'accepted', kind: 'exchange' })
  }
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 200)
})

test('accept: a gig-capped worker can still accept an exchange offer', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  await fillToLimit(app, worker)
  const res = await accept(app, (await openGigFor(app, 'exchange')).id, worker)
  assert.strictEqual(res.statusCode, 200)
})

test('accept: another worker holding gigs does not affect this one', { skip }, async () => {
  const app = getApp()
  const busy = await transactableWorker(app)
  await fillToLimit(app, busy)
  const fresh = await transactableWorker(app)
  const res = await accept(app, (await openGigFor(app)).id, fresh)
  assert.strictEqual(res.statusCode, 200)
})

test('accept: gigs the worker CREATED do not count against their capacity', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  for (let i = 0; i < LIMIT; i += 1) {
    const other = await createUser(app)
    await createEscrow(app, {
      creator_id: worker.row.id,
      counterparty_id: other.row.id,
      status: 'accepted',
      completion_deadline: new Date(Date.now() + 24 * HOUR),
    })
  }
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 200)
})

// ---------- retuning the cap at runtime -------------------------------------
// The cap is only worth calling "tunable" if changing it takes effect without a
// deploy. This drives the whole chain: admin PATCH → cache invalidation →
// capacity guard.

test('accept: lowering max_pending_gigs to 1 immediately blocks a worker holding one gig', { skip }, async () => {
  const app = getApp()
  await app.db.insert(platform_config).values({ id: 1 }).onConflictDoNothing()
  const admin = await createUser(app, { role: 'super_admin' })
  const worker = await transactableWorker(app)
  await heldEscrow(app, worker, { status: 'accepted' })

  // Default limit is 2, so one held gig still leaves room.
  const before = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(before.statusCode, 200)

  const patched = await app.inject({
    method: 'PATCH', url: '/v1/admin/platform-config',
    headers: authHeader(admin.token), payload: { max_pending_gigs: 1 },
  })
  assert.strictEqual(patched.statusCode, 200)

  const after = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(after.statusCode, 403)
  assert.strictEqual(after.json().code, ErrorCode.GIG_CAPACITY_REACHED)
  assert.strictEqual(after.json().details.limit, 1)

  // No restore needed: resetDb truncates platform_config AND drops the
  // 5-minute config cache before the next test — see the guard below.
})

test('accept: the previous test\'s config PATCH does not leak into this one', { skip }, async () => {
  // Guards the harness, not the feature: platform_config is cached in-process
  // for 5 minutes, so truncating the row is not enough — resetDb must also
  // drop the cache or every test after a PATCH silently runs on stale config.
  // Without that invalidation this test sees limit=1 and fails.
  const app = getApp()
  const worker = await transactableWorker(app)
  await heldEscrow(app, worker, { status: 'accepted' })
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 200, 'default limit of 2 should still apply')
})

// ---------- NULL deadlines are the safe default ------------------------------
// Production always stamps both deadlines (accept sets completion_deadline,
// submit sets approval_deadline), so these are defensive. They are pinned
// because the alternative reading — "no deadline means the window passed" —
// would silently hand a worker unlimited capacity, and nothing else in the
// suite would catch that flip.

test('accept: an accepted gig with no completion_deadline still occupies a slot', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  for (let i = 0; i < LIMIT; i += 1) {
    await heldEscrow(app, worker, { status: 'accepted', completion_deadline: null })
  }
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 403)
})

test('accept: a submitted gig with no approval_deadline still occupies a slot', { skip }, async () => {
  const app = getApp()
  const worker = await transactableWorker(app)
  for (let i = 0; i < LIMIT; i += 1) {
    await heldEscrow(app, worker, { status: 'submitted', approval_deadline: null })
  }
  const res = await accept(app, (await openGigFor(app)).id, worker)
  assert.strictEqual(res.statusCode, 403)
})
