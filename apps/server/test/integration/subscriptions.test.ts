/**
 * #98 gap-fill — gig subscriptions CRUD:
 *   GET    /v1/subscriptions       (own list)
 *   POST   /v1/subscriptions       (upsert; '*' sentinel for city/category)
 *   DELETE /v1/subscriptions/:id   (own-only, 404)
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('subscriptions: GET requires auth', { skip }, async () => {
  const app = getApp()
  const res = await app.inject({ method: 'GET', url: '/v1/subscriptions' })
  assert.strictEqual(res.statusCode, 401)
})

test('subscriptions: POST creates and GET lists the caller’s subscriptions', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const create = await app.inject({
    method: 'POST', url: '/v1/subscriptions',
    headers: authHeader(u.token), payload: { city: 'Lagos', category: 'delivery' },
  })
  assert.strictEqual(create.statusCode, 201)
  assert.strictEqual(create.json().city, 'Lagos')

  const list = await app.inject({ method: 'GET', url: '/v1/subscriptions', headers: authHeader(u.token) })
  assert.strictEqual(list.statusCode, 200)
  assert.strictEqual(list.json().length, 1)
  assert.strictEqual(list.json()[0].category, 'delivery')
})

test('subscriptions: omitted city/category default to the "*" wildcard', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/subscriptions', headers: authHeader(u.token), payload: {},
  })
  assert.strictEqual(res.statusCode, 201)
  assert.strictEqual(res.json().city, '*')
  assert.strictEqual(res.json().category, '*')
})

test('subscriptions: re-POSTing the same key upserts without duplicating', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const payload = { city: 'Abuja', category: 'photo' }
  await app.inject({ method: 'POST', url: '/v1/subscriptions', headers: authHeader(u.token), payload })
  const second = await app.inject({ method: 'POST', url: '/v1/subscriptions', headers: authHeader(u.token), payload })
  assert.ok(second.statusCode === 200 || second.statusCode === 201)
  const list = await app.inject({ method: 'GET', url: '/v1/subscriptions', headers: authHeader(u.token) })
  assert.strictEqual(list.json().length, 1, 'no duplicate row')
})

test('subscriptions: DELETE removes the caller’s subscription', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const created = await app.inject({
    method: 'POST', url: '/v1/subscriptions', headers: authHeader(u.token), payload: { city: 'Lagos' },
  })
  const id = created.json().id
  const del = await app.inject({ method: 'DELETE', url: `/v1/subscriptions/${id}`, headers: authHeader(u.token) })
  assert.strictEqual(del.statusCode, 200)
  assert.strictEqual(del.json().ok, true)
})

test('subscriptions: DELETE 404 for an id the caller does not own', { skip }, async () => {
  const app = getApp()
  const owner = await createUser(app)
  const other = await createUser(app)
  const created = await app.inject({
    method: 'POST', url: '/v1/subscriptions', headers: authHeader(owner.token), payload: { city: 'Lagos' },
  })
  const id = created.json().id
  const del = await app.inject({ method: 'DELETE', url: `/v1/subscriptions/${id}`, headers: authHeader(other.token) })
  assert.strictEqual(del.statusCode, 404)
})
