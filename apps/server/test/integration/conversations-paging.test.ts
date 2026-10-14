/**
 * GET /v1/conversations — cursor paging past the first page.
 *
 * The list used to stop at 50 with no way to reach the 51st. These build the
 * awkward shapes straight in the database, because the bugs a keyset cursor can
 * have are all about rows that SHARE or LACK the sort key: equal timestamps,
 * timestamps equal to the millisecond but not the microsecond, and
 * conversations that have no message yet (`last_message_at` is NULL).
 *
 * Every walk asserts the same thing: each conversation exactly once, in order.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq, sql } from 'drizzle-orm'
import { MAX_PAGINATION_LIMIT, type Conversation } from '@tenda/shared'
import { conversations, messages } from '@tenda/shared/db/schema'
import { TEST_DB_CONFIGURED, authHeader, createUser, resetDb, useTestApp, type TestUser } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** `null` = no message yet; a string is a timestamptz literal (microseconds survive). */
type At = string | null

interface Seeded {
  id: string
  at: At
}

/** One conversation between `me` and a fresh user, with the given last_message_at. */
async function seed(me: TestUser, at: At): Promise<Seeded> {
  const app = getApp()
  const other = await createUser(app)
  const [a, b] = me.row.id < other.row.id ? [me.row.id, other.row.id] : [other.row.id, me.row.id]
  const [row] = await app.db
    .insert(conversations)
    .values({ user_a_id: a, user_b_id: b, last_message_at: at === null ? null : sql`${at}::timestamptz` })
    .returning({ id: conversations.id })
  return { id: row.id, at }
}

async function page(me: TestUser, query: string): Promise<{ status: number; body: Conversation[] }> {
  const res = await getApp().inject({ method: 'GET', url: `/v1/conversations${query}`, headers: authHeader(me.token) })
  return { status: res.statusCode, body: res.statusCode === 200 ? res.json<Conversation[]>() : [] }
}

/** Follow the cursor until a page comes back short; the ids in the order they arrived. */
async function walk(me: TestUser, limit: number): Promise<string[]> {
  const ids: string[] = []
  let before: string | undefined
  for (let guard = 0; guard < 200; guard += 1) {
    const { status, body } = await page(me, `?limit=${limit}${before === undefined ? '' : `&before_id=${before}`}`)
    assert.strictEqual(status, 200)
    ids.push(...body.map((c) => c.id))
    if (body.length < limit) return ids
    before = body[body.length - 1].id
  }
  throw new Error('the walk never ended')
}

const T = (s: string): string => `2026-10-04 12:00:${s}+00`

test('paging walks every conversation exactly once, newest first, across a boundary', { skip }, async () => {
  await resetDb(getApp())
  const me = await createUser(getApp())
  const made: Seeded[] = []
  for (let i = 0; i < 23; i += 1) made.push(await seed(me, T(String(i).padStart(2, '0'))))
  const expected = made.slice().reverse().map((c) => c.id)

  assert.deepStrictEqual(await walk(me, 10), expected)
})

test('no params is the old behaviour: the newest page of 50, and the 51st is now reachable', { skip }, async () => {
  await resetDb(getApp())
  const me = await createUser(getApp())
  const made: Seeded[] = []
  for (let i = 0; i < 52; i += 1) made.push(await seed(me, `2026-10-04 12:${String(i).padStart(2, '0')}:00+00`))
  const newestFirst = made.slice().reverse().map((c) => c.id)

  const first = await page(me, '')
  assert.deepStrictEqual(first.body.map((c) => c.id), newestFirst.slice(0, 50))
  const second = await page(me, `?before_id=${first.body[49].id}`)
  assert.deepStrictEqual(second.body.map((c) => c.id), newestFirst.slice(50))
})

test('conversations sharing one timestamp are neither skipped nor repeated at a boundary', { skip }, async () => {
  await resetDb(getApp())
  const me = await createUser(getApp())
  const made: Seeded[] = []
  for (let i = 0; i < 7; i += 1) made.push(await seed(me, T('30')))
  // Tie broken by id, descending — the order the list itself uses.
  const expected = made.map((c) => c.id).sort().reverse()

  assert.deepStrictEqual(await walk(me, 3), expected)
})

test('timestamps equal to the millisecond but not the microsecond are all returned, in order', { skip }, async () => {
  // A cursor carried through a JS Date would be cut to .123 and every sibling
  // between .123000 and .123999 would fall on the wrong side of it.
  await resetDb(getApp())
  const me = await createUser(getApp())
  const low = await seed(me, T('10.123000'))
  const mid = await seed(me, T('10.123400'))
  const high = await seed(me, T('10.123456'))

  assert.deepStrictEqual(await walk(me, 1), [high.id, mid.id, low.id])
})

test('conversations with no message yet (NULL last_message_at) are paged through, not dropped', { skip }, async () => {
  await resetDb(getApp())
  const me = await createUser(getApp())
  const stamped = [await seed(me, T('01')), await seed(me, T('02')), await seed(me, T('03'))]
  const empty = [await seed(me, null), await seed(me, null), await seed(me, null)]
  // Postgres sorts NULLs FIRST under DESC; within the group, by id descending.
  const expected = [...empty.map((c) => c.id).sort().reverse(), ...stamped.slice().reverse().map((c) => c.id)]

  assert.deepStrictEqual(await walk(me, 2), expected)
})

test('a malformed before_id is a 400, an unknown one a 404, an empty one is no cursor', { skip }, async () => {
  await resetDb(getApp())
  const me = await createUser(getApp())
  const only = await seed(me, T('05'))

  const bad = await getApp().inject({ method: 'GET', url: '/v1/conversations?before_id=banana', headers: authHeader(me.token) })
  assert.strictEqual(bad.statusCode, 400)
  assert.strictEqual(bad.json().code, 'VALIDATION_ERROR')
  assert.strictEqual((await page(me, '?before_id=00000000-0000-4000-8000-000000000000')).status, 404)
  assert.deepStrictEqual((await page(me, '?before_id=')).body.map((c) => c.id), [only.id])
})

test('another user\'s conversation is not a usable cursor, and never appears in the list', { skip }, async () => {
  await resetDb(getApp())
  const me = await createUser(getApp())
  const stranger = await createUser(getApp())
  const mine = await seed(me, T('05'))
  const theirs = await seed(stranger, T('06'))

  assert.strictEqual((await page(me, `?before_id=${theirs.id}`)).status, 404, 'a stranger\'s conversation was accepted as a cursor')
  assert.deepStrictEqual((await page(me, '')).body.map((c) => c.id), [mine.id])
})

test('a conversation closed between two pages still works as the cursor', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const me = await createUser(app)
  const made: Seeded[] = []
  for (let i = 0; i < 5; i += 1) made.push(await seed(me, T(String(i).padStart(2, '0'))))
  const newestFirst = made.slice().reverse().map((c) => c.id)

  const first = await page(me, '?limit=2')
  const boundary = first.body[1].id
  await app.db.update(conversations).set({ status: 'closed' }).where(eq(conversations.id, boundary))

  const second = await page(me, `?limit=2&before_id=${boundary}`)
  assert.strictEqual(second.status, 200)
  assert.deepStrictEqual(second.body.map((c) => c.id), newestFirst.slice(2, 4))
})

test('limit: garbage and zero fall back to the default, negative to one row, huge to the shared ceiling', { skip }, async () => {
  await resetDb(getApp())
  const me = await createUser(getApp())
  for (let i = 0; i < 3; i += 1) await seed(me, T(String(i).padStart(2, '0')))

  assert.strictEqual((await page(me, '?limit=abc')).body.length, 3)
  assert.strictEqual((await page(me, '?limit=0')).body.length, 3)
  assert.strictEqual((await page(me, '?limit=-5')).body.length, 1)
  assert.strictEqual((await page(me, `?limit=${MAX_PAGINATION_LIMIT + 1000}`)).body.length, 3)
})

test('a later page carries its own unread count and last-message preview', { skip }, async () => {
  const app = getApp()
  await resetDb(app)
  const me = await createUser(app)
  const newer = await seed(me, T('20'))
  const older = await seed(me, T('10'))
  const [row] = await app.db.select({ a: conversations.user_a_id, b: conversations.user_b_id }).from(conversations).where(eq(conversations.id, older.id))
  const otherId = row.a === me.row.id ? row.b : row.a
  await app.db.insert(messages).values({ conversation_id: older.id, sender_id: otherId, content: 'hello from the second page' })

  const second = await page(me, `?limit=1&before_id=${newer.id}`)
  assert.strictEqual(second.body.length, 1)
  assert.strictEqual(second.body[0].id, older.id)
  assert.strictEqual(second.body[0].unread_count, 1)
  assert.strictEqual(second.body[0].last_message, 'hello from the second page')
})
