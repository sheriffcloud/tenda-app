/**
 * GET /v1/disputes — the caller's party-facing dispute list. Covers the
 * open/resolved filters, the live-dispute guard for `open`, party scoping
 * (strangers excluded, both sides included), role + counterparty resolution,
 * pagination, the empty state, and validation.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { disputes } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachGigDetails,
  authHeader,
} from '../helpers/test-app'
import { disputedEscrow } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

function url(status?: string, extra = ''): string {
  const q = [status !== undefined ? `status=${status}` : '', extra].filter(Boolean).join('&')
  return `/v1/disputes${q ? `?${q}` : ''}`
}

test('mine: requires authentication', { skip }, async () => {
  const app = getApp()
  const res = await app.inject({ method: 'GET', url: url('open') })
  assert.strictEqual(res.statusCode, 401)
})

test('mine: invalid status is rejected', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  const res = await app.inject({ method: 'GET', url: url('archived'), headers: authHeader(user.token) })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
})

test('mine: both parties see the open dispute with correct role + counterparty', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app, { first_name: 'Cora', last_name: 'Poster' })
  const worker = await createUser(app, { first_name: 'Wade', last_name: 'Worker' })
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'disputed',
  })
  await attachGigDetails(app, escrow.id, { title: 'Paint the fence' })
  await app.db
    .insert(disputes)
    .values({ escrow_id: escrow.id, raised_by: creator.row.id, reason: 'Never showed up to paint' })

  // Creator's view: role creator, counterparty = the worker, raised_by_me true.
  const asCreator = await app.inject({ method: 'GET', url: url('open'), headers: authHeader(creator.token) })
  assert.strictEqual(asCreator.statusCode, 200)
  const creatorBody = asCreator.json()
  assert.strictEqual(creatorBody.total, 1)
  assert.strictEqual(creatorBody.data.length, 1)
  const cRow = creatorBody.data[0]
  assert.strictEqual(cRow.escrow_id, escrow.id)
  assert.strictEqual(cRow.kind, 'gig')
  assert.strictEqual(cRow.subject_title, 'Paint the fence')
  assert.strictEqual(cRow.status, 'disputed')
  assert.strictEqual(cRow.my_role, 'creator')
  assert.strictEqual(cRow.counterparty_name, 'Wade Worker')
  assert.strictEqual(cRow.raised_by_me, true)
  assert.strictEqual(cRow.winner, null)
  assert.strictEqual(cRow.resolved_at, null)

  // Worker's view: role counterparty, counterparty = the creator, raised_by_me false.
  const asWorker = await app.inject({ method: 'GET', url: url('open'), headers: authHeader(worker.token) })
  const wRow = asWorker.json().data[0]
  assert.strictEqual(wRow.my_role, 'counterparty')
  assert.strictEqual(wRow.counterparty_name, 'Cora Poster')
  assert.strictEqual(wRow.raised_by_me, false)
})

test('mine: strangers to the escrow see nothing', { skip }, async () => {
  const app = getApp()
  const { escrow } = await disputedEscrow(app)
  assert.ok(escrow)
  const stranger = await createUser(app)
  const res = await app.inject({ method: 'GET', url: url('open'), headers: authHeader(stranger.token) })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().total, 0)
  assert.deepStrictEqual(res.json().data, [])
})

test('mine: open excludes an unconfirmed dispute (row exists, escrow not disputed)', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  // Escrow never reached 'disputed' on-chain — a triage row from an abandoned
  // attempt must not surface as an actionable open dispute.
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'accepted',
  })
  await app.db
    .insert(disputes)
    .values({ escrow_id: escrow.id, raised_by: creator.row.id, reason: 'Attempted but never broadcast' })

  const open = await app.inject({ method: 'GET', url: url('open'), headers: authHeader(creator.token) })
  assert.strictEqual(open.json().total, 0)

  // It IS still visible in the unfiltered history (the caller can find it).
  const all = await app.inject({ method: 'GET', url: url(), headers: authHeader(creator.token) })
  assert.strictEqual(all.json().total, 1)
})

test('mine: resolved filter returns only resolved, with the winner', { skip }, async () => {
  const app = getApp()
  const { creator, escrow, dispute_id } = await disputedEscrow(app)
  const admin = await createUser(app, { role: 'super_admin' })
  await app.db
    .update(disputes)
    .set({ resolved_at: new Date(), resolved_by: admin.row.id, winner: 'creator' })
    .where(eq(disputes.id, dispute_id))
  assert.ok(escrow)

  const open = await app.inject({ method: 'GET', url: url('open'), headers: authHeader(creator.token) })
  assert.strictEqual(open.json().total, 0)

  const resolved = await app.inject({ method: 'GET', url: url('resolved'), headers: authHeader(creator.token) })
  assert.strictEqual(resolved.json().total, 1)
  const row = resolved.json().data[0]
  assert.strictEqual(row.winner, 'creator')
  assert.notStrictEqual(row.resolved_at, null)
})

test('mine: empty state for a user with no disputes', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app)
  const res = await app.inject({ method: 'GET', url: url(), headers: authHeader(user.token) })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), { data: [], total: 0, limit: 20, offset: 0 })
})

test('mine: pagination — limit + offset page through the caller disputes', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  for (let i = 0; i < 3; i++) {
    const worker = await createUser(app)
    const escrow = await createEscrow(app, {
      creator_id: creator.row.id,
      counterparty_id: worker.row.id,
      status: 'disputed',
    })
    await app.db
      .insert(disputes)
      .values({ escrow_id: escrow.id, raised_by: creator.row.id, reason: `dispute number ${i}` })
  }

  const page1 = await app.inject({ method: 'GET', url: url('open', 'limit=2&offset=0'), headers: authHeader(creator.token) })
  assert.strictEqual(page1.json().total, 3)
  assert.strictEqual(page1.json().data.length, 2)

  const page2 = await app.inject({ method: 'GET', url: url('open', 'limit=2&offset=2'), headers: authHeader(creator.token) })
  assert.strictEqual(page2.json().data.length, 1)
})
