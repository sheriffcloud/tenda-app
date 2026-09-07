/**
 * #98 gap-fill — chat: conversations + messages:
 *   GET/POST /v1/conversations          (list, find-or-create, reopen)
 *   GET/POST /v1/conversations/:id/messages (participant guard, send, validation)
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

async function conversation(app: ReturnType<typeof getApp>, aToken: string, bId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/v1/conversations', headers: authHeader(aToken), payload: { user_id: bId },
  })
  assert.strictEqual(res.statusCode, 200)
  return res.json().id
}

// ---------- conversations list / find-or-create ---------------------------------

test('GET /v1/conversations: 401 without a token', { skip }, async () => {
  const app = getApp()
  const res = await app.inject({ method: 'GET', url: '/v1/conversations' })
  assert.strictEqual(res.statusCode, 401)
})

test('GET /v1/conversations: empty array for a user with no chats', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({ method: 'GET', url: '/v1/conversations', headers: authHeader(u.token) })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), [])
})

test('POST /v1/conversations: cannot start one with yourself', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/conversations', headers: authHeader(u.token), payload: { user_id: u.row.id },
  })
  assert.strictEqual(res.statusCode, 400)
})

test('POST /v1/conversations: 404 for an unknown target user', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/conversations', headers: authHeader(u.token),
    payload: { user_id: '00000000-0000-0000-0000-000000000000' },
  })
  assert.strictEqual(res.statusCode, 404)
})

test('POST /v1/conversations: find-or-create is idempotent for the same pair', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const first = await conversation(app, a.token, b.row.id)
  // The other party resolving the same pair gets the SAME conversation row.
  const second = await conversation(app, b.token, a.row.id)
  assert.strictEqual(first, second, 'canonical pair maps to one conversation')
})

test('GET /v1/conversations: lists the active conversation with the other user', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app, { first_name: 'Aa' })
  const b = await createUser(app, { first_name: 'Bb' })
  await conversation(app, a.token, b.row.id)
  const res = await app.inject({ method: 'GET', url: '/v1/conversations', headers: authHeader(a.token) })
  assert.strictEqual(res.statusCode, 200)
  const rows = res.json()
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].other_user.id, b.row.id)
  assert.strictEqual(rows[0].unread_count, 0)
})

// ---------- messages -------------------------------------------------------------

test('POST messages: 403 for a non-participant', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const outsider = await createUser(app)
  const convId = await conversation(app, a.token, b.row.id)
  const res = await app.inject({
    method: 'POST', url: `/v1/conversations/${convId}/messages`,
    headers: authHeader(outsider.token), payload: { content: 'hi' },
  })
  assert.strictEqual(res.statusCode, 403)
})

test('GET messages: 404 for an unknown conversation', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'GET', url: '/v1/conversations/00000000-0000-0000-0000-000000000000/messages',
    headers: authHeader(u.token),
  })
  assert.strictEqual(res.statusCode, 404)
})

test('POST messages: a participant sends, and it appears in the history', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const convId = await conversation(app, a.token, b.row.id)
  const send = await app.inject({
    method: 'POST', url: `/v1/conversations/${convId}/messages`,
    headers: authHeader(a.token), payload: { content: 'hello there' },
  })
  assert.strictEqual(send.statusCode, 201)
  assert.strictEqual(send.json().content, 'hello there')

  const list = await app.inject({
    method: 'GET', url: `/v1/conversations/${convId}/messages`, headers: authHeader(b.token),
  })
  assert.strictEqual(list.statusCode, 200)
  const contents = list.json().map((m: { content: string }) => m.content)
  assert.ok(contents.includes('hello there'))
})

test('POST messages: empty content with no attachment is rejected', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const convId = await conversation(app, a.token, b.row.id)
  const res = await app.inject({
    method: 'POST', url: `/v1/conversations/${convId}/messages`,
    headers: authHeader(a.token), payload: { content: '   ' },
  })
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
})

test('POST messages: content over 2000 chars is rejected', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const convId = await conversation(app, a.token, b.row.id)
  const res = await app.inject({
    method: 'POST', url: `/v1/conversations/${convId}/messages`,
    headers: authHeader(a.token), payload: { content: 'x'.repeat(2001) },
  })
  assert.strictEqual(res.statusCode, 400)
})
