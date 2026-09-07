/**
 * #98 gap-fill — user profile + sub-resource read routes:
 *   GET   /v1/users/:id                (public profile, 404)
 *   PATCH /v1/users/:id                (own-only, avatar/country/coord/orphan-city)
 *   GET   /v1/users/:id/reviews        (paginated)
 *   GET   /v1/users/:id/transactions   (own-only escrow tx history)
 *   GET   /v1/users/me                 (the caller's OWN profile — #38 added the
 *                                       created_at wire-shape case; the route is
 *                                       otherwise exercised by the auth suites)
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { reviews, escrow_transactions } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  authHeader,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- GET /v1/users/:id ----------------------------------------------------

test('GET /v1/users/:id: returns the public profile, no PII', { skip }, async () => {
  const app = getApp()
  const { row } = await createUser(app, { first_name: 'Ada', last_name: 'Lovelace', bio: 'hi' })
  const res = await app.inject({ method: 'GET', url: `/v1/users/${row.id}` })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.strictEqual(body.first_name, 'Ada')
  assert.strictEqual(body.bio, 'hi')
  assert.ok(!('phone_e164' in body), 'phone must not leak')
  assert.ok(!('wallet_address' in body))
})

test('GET /v1/users/:id: 404 for an unknown user', { skip }, async () => {
  const app = getApp()
  const res = await app.inject({ method: 'GET', url: '/v1/users/00000000-0000-0000-0000-000000000000' })
  assert.strictEqual(res.statusCode, 404)
  assert.strictEqual(res.json().code, 'USER_NOT_FOUND')
})

// ---------- PATCH /v1/users/:id --------------------------------------------------

test('PATCH /v1/users/:id: 403 when editing another user', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const res = await app.inject({
    method: 'PATCH', url: `/v1/users/${b.row.id}`,
    headers: authHeader(a.token), payload: { first_name: 'X' },
  })
  assert.strictEqual(res.statusCode, 403)
})

test('PATCH /v1/users/:id: rejects a non-Cloudinary avatar URL', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'PATCH', url: `/v1/users/${u.row.id}`,
    headers: authHeader(u.token), payload: { avatar_url: 'https://evil.com/x.jpg' },
  })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
})

test('PATCH /v1/users/:id: rejects an unsupported country', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'PATCH', url: `/v1/users/${u.row.id}`,
    headers: authHeader(u.token), payload: { country: 'ZZ' },
  })
  assert.strictEqual(res.statusCode, 400)
  // …including a key every plain object inherits: `'toString' in LOCATIONS` is
  // TRUE, so a membership check written that way PERSISTED it, and the stored
  // value then rides UserRef.country on every gig this user posts.
  const proto = await app.inject({
    method: 'PATCH', url: `/v1/users/${u.row.id}`,
    headers: authHeader(u.token), payload: { country: 'toString' },
  })
  assert.strictEqual(proto.statusCode, 400, proto.body)
})

test('PATCH /v1/users/:id: a valid update persists', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'NG', city: 'Lagos' })
  const res = await app.inject({
    method: 'PATCH', url: `/v1/users/${u.row.id}`,
    headers: authHeader(u.token), payload: { first_name: 'Grace', bio: 'updated' },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().first_name, 'Grace')
  assert.strictEqual(res.json().bio, 'updated')
})

test('PATCH /v1/users/:id: changing country to one not holding the city nulls the orphan city', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'NG', city: 'Lagos' })
  const res = await app.inject({
    method: 'PATCH', url: `/v1/users/${u.row.id}`,
    headers: authHeader(u.token), payload: { country: 'KE' }, // Lagos is not in KE
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().country, 'KE')
  assert.strictEqual(res.json().city, null, 'orphan city is nulled')
})

// ---------- GET /v1/users/:id/reviews --------------------------------------------

test('GET /v1/users/:id/reviews: lists reviews left for the user', { skip }, async () => {
  const app = getApp()
  const reviewee = await createUser(app)
  const reviewer = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: reviewer.row.id, status: 'completed' })
  await app.db.insert(reviews).values({
    escrow_id: escrow.id, reviewer_id: reviewer.row.id, reviewee_id: reviewee.row.id,
    score: 5, comment: 'great work',
  })
  const res = await app.inject({ method: 'GET', url: `/v1/users/${reviewee.row.id}/reviews` })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.strictEqual(body.total, 1)
  assert.strictEqual(body.data[0].score, 5)
  assert.strictEqual(body.data[0].comment, 'great work')
})

test('GET /v1/users/:id/reviews: empty list for a user with none', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({ method: 'GET', url: `/v1/users/${u.row.id}/reviews` })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().total, 0)
})

// ---------- GET /v1/users/:id/transactions ---------------------------------------

test('GET /v1/users/:id/transactions: 403 fetching another user’s history', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const res = await app.inject({
    method: 'GET', url: `/v1/users/${b.row.id}/transactions`, headers: authHeader(a.token),
  })
  assert.strictEqual(res.statusCode, 403)
})

test('GET /v1/users/:id/transactions: returns the caller’s escrow transactions', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: u.row.id, status: 'completed' })
  await app.db.insert(escrow_transactions).values({
    escrow_id: escrow.id, type: 'create', tx_ref: `txref-${escrow.id}`,
    amount_raw: '5000000', platform_fee_raw: '125000', actor_id: u.row.id,
  })
  const res = await app.inject({
    method: 'GET', url: `/v1/users/${u.row.id}/transactions`, headers: authHeader(u.token),
  })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.strictEqual(body.total, 1)
  assert.strictEqual(body.data[0].type, 'create')
})

test('GET /v1/users/:id/transactions: a resolve row serves BOTH parties\' payout shares', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const counterparty = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: counterparty.row.id, status: 'resolved',
  })
  await app.db.insert(escrow_transactions).values({
    escrow_id: escrow.id, type: 'resolve', tx_ref: `resolve-${escrow.id}`,
    amount_raw: '501', creator_payout_raw: '500', platform_fee_raw: '0', actor_id: null,
  })

  for (const viewer of [creator, counterparty]) {
    const res = await app.inject({
      method: 'GET', url: `/v1/users/${viewer.row.id}/transactions`, headers: authHeader(viewer.token),
    })
    assert.strictEqual(res.statusCode, 200)
    const row = res.json().data[0]
    assert.strictEqual(row.amount_raw, '501') // counterparty share
    assert.strictEqual(row.creator_payout_raw, '500') // creator share
  }
})

// ---------- GET /v1/users/me: the created_at contract (#38) -----------------------

test('GET /v1/users/me: created_at reaches the wire as an ISO STRING, never null', { skip }, async () => {
  // `MeUser.created_at` was narrowed to `string` in #38 because users.created_at
  // is NOT NULL. Unlike every other route in that change, this one does not call
  // `.toISOString()` — it spreads the Drizzle row and lets Fastify serialise the
  // Date. So the type rests on the SERIALISER's behaviour, and nothing measured
  // it. This does: a Date that reached the client as `{}`, or a schema that
  // dropped the field, would both satisfy the compiler and break every reader.
  const app = getApp()
  const { row, token } = await createUser(app, { first_name: 'Ada', last_name: 'Lovelace' })

  const res = await app.inject({ method: 'GET', url: '/v1/users/me', headers: authHeader(token) })

  assert.strictEqual(res.statusCode, 200)
  const { user } = res.json()
  assert.strictEqual(typeof user.created_at, 'string', 'not a Date, not an object, not absent')
  assert.strictEqual(user.created_at, row.created_at.toISOString(), 'the row’s own instant')
  // Round-trips through the parser every client uses to render it.
  assert.ok(!Number.isNaN(new Date(user.created_at).getTime()))
})
