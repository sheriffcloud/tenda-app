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

test('GET messages: 403 for a non-participant (#105 T3)', { skip }, async () => {
  // The POST side already had this case; the GET side did not, so reading a
  // stranger's thread was guarded by a line no test ran. Reading is the more
  // damaging direction — it discloses the conversation rather than adding to it.
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const stranger = await createUser(app)

  const created = await app.inject({
    method: 'POST', url: '/v1/conversations', headers: authHeader(a.token),
    payload: { user_id: b.row.id },
  })
  assert.strictEqual(created.statusCode, 200, created.body)
  const conversationId = created.json().id

  const forbidden = await app.inject({
    method: 'GET', url: `/v1/conversations/${conversationId}/messages`,
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(forbidden.statusCode, 403)
  assert.match(forbidden.json().message, /Not a participant of this conversation/)

  // ...and a participant reads it fine, so the 403 is scoping and not a broken
  // route.
  const allowed = await app.inject({
    method: 'GET', url: `/v1/conversations/${conversationId}/messages`,
    headers: authHeader(b.token),
  })
  assert.strictEqual(allowed.statusCode, 200)
})

test('POST messages: an escrow_id that references nothing is 400, not a 500 (#105 T3)', { skip }, async () => {
  // The context reference is an FK column. Without this guard a bad id reaches
  // postgres and surfaces as a foreign-key violation — a 500 for what is plainly
  // a client error, which is exactly what the guard's own comment says it is
  // there to prevent. Nothing ran it.
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const created = await app.inject({
    method: 'POST', url: '/v1/conversations', headers: authHeader(a.token),
    payload: { user_id: b.row.id },
  })
  assert.strictEqual(created.statusCode, 200, created.body)

  const res = await app.inject({
    method: 'POST', url: `/v1/conversations/${created.json().id}/messages`,
    headers: authHeader(a.token),
    payload: { content: 'about that job', escrow_id: '00000000-0000-0000-0000-000000000000' },
  })
  assert.strictEqual(res.statusCode, 400)
  assert.match(res.json().message, /escrow_id does not reference an existing escrow/)
})

// ---------- both sides of the participant pair (#122) ---------------------------
//
// Conversations are stored canonically, `user_a_id < user_b_id` by string
// compare (routes/v1/conversations/index.ts `canonicalPair`), and test users get
// `randomUUID()` ids. So which SIDE of the pair a message sender lands on was a
// coin flip per run, and two branches in the send handler were covered or not
// according to it:
//
//   line 195  `conv.user_a_id !== userId && conv.user_b_id !== userId`
//             — a sender who IS user_a short-circuits on the first operand, so
//               the second is only ever evaluated for a user_b sender
//   line 242  `conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id`
//             — the recipient pick, one arm per side
//
// WHAT THIS CASE DOES NOT DO, said plainly so nobody reads it as more than it
// is: it EXECUTES both arms of line 242 but does not assert the value. Measured
// — replacing that ternary with a constant `conv.user_b_id` leaves this case,
// the notifications-plugin suite and notifications-read all green, so who gets
// notified of a message is currently unguarded. Filed as #123; covering it needs
// the side-effects capture, not another status-code check.
//
// That is what made the server's branch total unreproducible: the file reported
// 48 branch points on an unlucky run and 50 on a lucky one, moving the global
// figure by ~0.02 with nobody having touched the source (#122). Pinning the ids
// makes both sides certain, which fixes the wobble by CLOSING the gap rather
// than by hiding it — the branches are now always covered.
const ID_LOW  = '00000000-0000-4000-8000-000000000001'
const ID_HIGH = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

test('POST messages: both participants can send, whichever side of the pair they are', { skip }, async () => {
  const app = getApp()
  // Ids chosen so the ordering is a FACT, not a draw: `ID_LOW` becomes
  // user_a_id and `ID_HIGH` user_b_id, under the same `a < b` compare the route
  // uses.
  assert.ok(ID_LOW < ID_HIGH, 'the fixture ids must order the way the route sorts them')
  const low  = await createUser(app, { id: ID_LOW })
  const high = await createUser(app, { id: ID_HIGH })
  const convId = await conversation(app, low.token, high.row.id)

  const send = async (token: string, content: string): Promise<number> => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${convId}/messages`,
      headers: authHeader(token),
      payload: { content },
    })
    return res.statusCode
  }

  // user_a's send takes the first arm of both constructs...
  assert.strictEqual(await send(low.token, 'from the low id'), 201)
  // ...and user_b's takes the second, which is the half that used to depend on
  // luck.
  assert.strictEqual(await send(high.token, 'from the high id'), 201)

  // EACH SIDE SEES THE OTHER'S MESSAGE AS UNREAD, asserted before either thread
  // is opened — reading marks them read, so the order here is behaviour. This is
  // what stops the case being a pair of status-code checks: a send that landed
  // in the wrong conversation, or was attributed to the wrong sender, would
  // still answer 201 and would show up here.
  const unreadFor = async (token: string): Promise<number> => {
    const res = await app.inject({ method: 'GET', url: '/v1/conversations', headers: authHeader(token) })
    assert.strictEqual(res.statusCode, 200)
    const rows = res.json() as Array<{ id: string; unread_count: number }>
    const row = rows.find((c) => c.id === convId)
    assert.ok(row !== undefined, 'the conversation is in both participants\' lists')
    return row.unread_count
  }
  assert.strictEqual(await unreadFor(low.token), 1, "user_a's unread is user_b's message")
  assert.strictEqual(await unreadFor(high.token), 1, "user_b's unread is user_a's message")

  // AND BOTH SIDES READ IT. The GET handler carries its own copy of the same
  // participant guard (line 69), so it has the same short-circuit: a reader who
  // is user_a never evaluates the second operand. Reading from one side only
  // left that half to the luck of whichever OTHER suite happened to read as
  // user_b — measured, and it was the residual wobble after the send half was
  // pinned. Both sides read, so both operands are a fact.
  const threadFor = async (token: string): Promise<string[]> => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/conversations/${convId}/messages`,
      headers: authHeader(token),
    })
    assert.strictEqual(res.statusCode, 200, res.body)
    // A bare array, not a `{ data }` envelope — this route returns `rows.map(...)`.
    return (res.json() as Array<{ content: string }>).map((m) => m.content).sort()
  }
  const both = ['from the high id', 'from the low id']
  assert.deepStrictEqual(await threadFor(high.token), both)
  assert.deepStrictEqual(await threadFor(low.token), both)
})
