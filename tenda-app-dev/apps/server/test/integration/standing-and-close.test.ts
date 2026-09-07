/**
 * #98 gap-fill — reputation standing reads + conversation close:
 *   GET  /v1/users/me/standing      (private — includes restriction)
 *   GET  /v1/users/:id/standing     (public — no restriction leak)
 *   POST /v1/conversations/:id/close (own-only, 404, idempotent re-close)
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- standing -------------------------------------------------------------

test('GET /v1/users/me/standing: 401 without a token', { skip }, async () => {
  const app = getApp()
  const res = await app.inject({ method: 'GET', url: '/v1/users/me/standing' })
  assert.strictEqual(res.statusCode, 401)
})

test('GET /v1/users/me/standing: a clean user has a null restriction', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({ method: 'GET', url: '/v1/users/me/standing', headers: authHeader(u.token) })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().restriction, null)
})

test('GET /v1/users/:id/standing: public summary omits the private restriction', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({ method: 'GET', url: `/v1/users/${u.row.id}/standing` })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(!('restriction' in res.json()), 'restriction stays private to the user')
})

// ---------- conversation close ---------------------------------------------------

async function makeConversation(app: ReturnType<typeof getApp>, aToken: string, bId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/v1/conversations', headers: authHeader(aToken), payload: { user_id: bId },
  })
  return res.json().id
}

test('POST /v1/conversations/:id/close: 404 for an unknown conversation', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/conversations/00000000-0000-0000-0000-000000000000/close',
    headers: authHeader(u.token),
  })
  assert.strictEqual(res.statusCode, 404)
})

test('POST /v1/conversations/:id/close: 403 for a non-participant', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const outsider = await createUser(app)
  const convId = await makeConversation(app, a.token, b.row.id)
  const res = await app.inject({
    method: 'POST', url: `/v1/conversations/${convId}/close`, headers: authHeader(outsider.token),
  })
  assert.strictEqual(res.statusCode, 403)
})

test('POST /v1/conversations/:id/close: closes, and re-closing is idempotent', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const convId = await makeConversation(app, a.token, b.row.id)
  const first = await app.inject({ method: 'POST', url: `/v1/conversations/${convId}/close`, headers: authHeader(a.token) })
  assert.strictEqual(first.statusCode, 200)
  assert.strictEqual(first.json().status, 'closed')
  // closing it again returns the already-closed row, not an error
  const second = await app.inject({ method: 'POST', url: `/v1/conversations/${convId}/close`, headers: authHeader(a.token) })
  assert.strictEqual(second.statusCode, 200)
  assert.strictEqual(second.json().status, 'closed')

  // a closed conversation drops out of the active inbox
  const inbox = await app.inject({ method: 'GET', url: '/v1/conversations', headers: authHeader(a.token) })
  assert.strictEqual(inbox.json().length, 0)
})
