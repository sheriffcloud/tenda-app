/**
 * CO2 route matrix — post-completion feedback + dispute intake:
 *   POST /v1/escrows/:id/review  (status/party guards, uniqueness → 409,
 *                                 review_score recompute)
 *   POST /v1/escrows/:id/dispute (validation + triage-row upsert)
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { disputes, reviews, users } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  FAKE_UNSIGNED,
  useTestApp,
  createUser,
  authHeader,
} from '../helpers/test-app'
import { partiedEscrow } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- review ---------------------------------------------------------------

test('POST review: 409 before completion', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await partiedEscrow(app, 'accepted')
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/review`,
    headers: authHeader(creator.token),
    payload: { score: 5 },
  })
  assert.strictEqual(res.statusCode, 409)
})

test('POST review: 403 for a non-party', { skip }, async () => {
  const app = getApp()
  const { escrow } = await partiedEscrow(app, 'completed')
  const stranger = await createUser(app)
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/review`,
    headers: authHeader(stranger.token),
    payload: { score: 5 },
  })
  assert.strictEqual(res.statusCode, 403)
})

test('POST review: 400 on an out-of-range score', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await partiedEscrow(app, 'completed')
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/review`,
    headers: authHeader(creator.token),
    payload: { score: 6 },
  })
  assert.strictEqual(res.statusCode, 400)
})

test('POST review: 201 recomputes review_score; duplicate → 409', { skip }, async () => {
  const app = getApp()
  const { creator, worker, escrow } = await partiedEscrow(app, 'completed')
  const first = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/review`,
    headers: authHeader(creator.token),
    payload: { score: 4, comment: 'solid work' },
  })
  assert.strictEqual(first.statusCode, 201)
  const [reviewee] = await app.db.select().from(users).where(eq(users.id, worker.row.id))
  assert.strictEqual(reviewee.review_score, '4.00')

  const dup = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/review`,
    headers: authHeader(creator.token),
    payload: { score: 1 },
  })
  assert.strictEqual(dup.statusCode, 409)
  assert.strictEqual(dup.json().code, 'REVIEW_ALREADY_EXISTS')

  // The other party reviews back — averages land on each profile separately.
  const back = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/review`,
    headers: authHeader(worker.token),
    payload: { score: 5 },
  })
  assert.strictEqual(back.statusCode, 201)
  const all = await app.db.select().from(reviews).where(eq(reviews.escrow_id, escrow.id))
  assert.strictEqual(all.length, 2)
})

// ---------- dispute (triage-row upsert) -------------------------------------------

test('POST dispute: 400 on a malformed bond, 400 on a short reason', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await partiedEscrow(app, 'accepted')
  const badBond = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/dispute`,
    headers: authHeader(creator.token),
    payload: { bond_raw: '1.5', reason: 'The worker never showed up at all' },
  })
  assert.strictEqual(badBond.statusCode, 400)
  const shortReason = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/dispute`,
    headers: authHeader(creator.token),
    payload: { bond_raw: '1000', reason: 'bad' },
  })
  assert.strictEqual(shortReason.statusCode, 400)
})

test('POST dispute: 409 from a non-disputable status', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await partiedEscrow(app, 'completed')
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/dispute`,
    headers: authHeader(creator.token),
    payload: { bond_raw: '1000', reason: 'This was completed against my will somehow' },
  })
  assert.strictEqual(res.statusCode, 409)
})

test('POST dispute: triage row upserts — re-raise refreshes the reason', { skip }, async () => {
  const app = getApp()
  const { creator, worker, escrow } = await partiedEscrow(app, 'accepted')
  const first = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/dispute`,
    headers: authHeader(creator.token),
    payload: { bond_raw: '1000', reason: 'The worker never showed up at all' },
  })
  assert.strictEqual(first.statusCode, 200)
  assert.deepStrictEqual(first.json().unsigned, FAKE_UNSIGNED)

  const again = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrow.id}/dispute`,
    headers: authHeader(worker.token),
    payload: { bond_raw: '1000', reason: 'Actually the poster is blocking my submission' },
  })
  assert.strictEqual(again.statusCode, 200)
  const [row] = await app.db.select().from(disputes).where(eq(disputes.escrow_id, escrow.id))
  assert.strictEqual(row.raised_by, worker.row.id)
  assert.strictEqual(row.reason, 'Actually the poster is blocking my submission')
})
