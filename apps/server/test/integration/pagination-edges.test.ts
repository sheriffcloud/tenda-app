/**
 * #98 — ADVERSARIAL: out-of-range pagination must clamp, never reach SQL raw.
 * Before clampLimit/clampOffset, a negative OFFSET made postgres throw → 500,
 * and a negative/NaN LIMIT leaked straight into the query + response. This
 * asserts the clamped contract and fails on a regression to the raw values.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

test('a negative offset clamps to 0 instead of crashing with 500', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({ method: 'GET', url: `/v1/users/${u.row.id}/reviews?offset=-10` })
  assert.notStrictEqual(res.statusCode, 500, 'negative offset must not reach postgres OFFSET')
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().offset, 0)
})

test('a negative limit clamps to the minimum (1), not echoed raw', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({ method: 'GET', url: `/v1/users/${u.row.id}/reviews?limit=-5` })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().limit, 1)
})

test('a non-numeric limit clamps instead of leaking NaN/null', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({ method: 'GET', url: `/v1/users/${u.row.id}/reviews?limit=abc` })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(Number.isInteger(res.json().limit) && res.json().limit >= 1)
})

test('an over-large limit clamps to the MAX (100)', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({ method: 'GET', url: `/v1/users/${u.row.id}/reviews?limit=999999` })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().limit, 100)
})

test('the same clamping holds on an authed paginated route (transactions)', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'GET', url: `/v1/users/${u.row.id}/transactions?offset=-1&limit=999999`,
    headers: authHeader(u.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().offset, 0)
  assert.strictEqual(res.json().limit, 100)
})
