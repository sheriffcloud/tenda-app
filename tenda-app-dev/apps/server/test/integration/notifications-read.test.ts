/**
 * Stage 3 — the notification read API: GET /v1/notifications (feed + targeted
 * announcements + unread count), GET /unread-count, POST /:id/read, POST
 * /read-all. Real app via fastify.inject; gated on TEST_DATABASE_URL.
 *
 * Announcements are inserted directly (their admin write path is Stage 4) to
 * exercise the fan-out-on-read targeting + the read cursor in isolation.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { notifications, announcements } from '@tenda/shared/db/schema'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

interface NotifOpts {
  title?: string
  body?: string
  data?: Record<string, string>
  read_at?: Date
  created_at?: Date
}

async function insertNotif(app: FastifyInstance, userId: string, o: NotifOpts = {}): Promise<string> {
  const id = randomUUID()
  await app.db.insert(notifications).values({
    id,
    user_id: userId,
    title: o.title ?? 'Title',
    body: o.body ?? 'Body',
    ...(o.data !== undefined ? { data: o.data } : {}),
    ...(o.read_at !== undefined ? { read_at: o.read_at } : {}),
    ...(o.created_at !== undefined ? { created_at: o.created_at } : {}),
  })
  return id
}

interface AnnOpts {
  title?: string
  target?: 'role' | 'country' | 'city'
  target_value?: string
  is_active?: boolean
  published_at?: Date | null
  expires_at?: Date | null
  priority?: number
}

async function insertAnn(app: FastifyInstance, o: AnnOpts = {}): Promise<string> {
  const id = randomUUID()
  await app.db.insert(announcements).values({
    id,
    title: o.title ?? 'Notice',
    body: 'Announcement body',
    priority: o.priority ?? 0,
    is_active: o.is_active ?? true,
    published_at: o.published_at === undefined ? new Date(Date.now() - 1000) : o.published_at,
    ...(o.target !== undefined ? { target: o.target, target_value: o.target_value } : {}),
    ...(o.expires_at !== undefined ? { expires_at: o.expires_at } : {}),
  })
  return id
}

const feedUrl = '/v1/notifications'

// ---------- auth ----------------------------------------------------------------

test('GET /notifications requires auth (401)', { skip }, async () => {
  const res = await getApp().inject({ method: 'GET', url: feedUrl })
  assert.strictEqual(res.statusCode, 401)
})

test('POST /notifications/read-all requires auth (401)', { skip }, async () => {
  const res = await getApp().inject({ method: 'POST', url: `${feedUrl}/read-all` })
  assert.strictEqual(res.statusCode, 401)
})

// ---------- feed: personal notifications ---------------------------------------

test('feed returns the caller\'s own notifications newest-first, never another user\'s', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const other = await createUser(app)
  await insertNotif(app, me.row.id, { title: 'old', created_at: new Date(Date.now() - 3000) })
  await insertNotif(app, me.row.id, { title: 'new', created_at: new Date(Date.now() - 1000) })
  await insertNotif(app, other.row.id, { title: 'theirs' })

  const res = await app.inject({ method: 'GET', url: feedUrl, headers: authHeader(me.token) })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.deepStrictEqual(body.notifications.map((n: { title: string }) => n.title), ['new', 'old'])
})

test('feed paginates with before_id (older page), scoped to the caller', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const a = await insertNotif(app, me.row.id, { title: 'a', created_at: new Date(Date.now() - 3000) })
  const b = await insertNotif(app, me.row.id, { title: 'b', created_at: new Date(Date.now() - 2000) })
  await insertNotif(app, me.row.id, { title: 'c', created_at: new Date(Date.now() - 1000) })

  const res = await app.inject({
    method: 'GET',
    url: `${feedUrl}?before_id=${b}&limit=10`,
    headers: authHeader(me.token),
  })
  const titles = res.json().notifications.map((n: { id: string; title: string }) => n.title)
  assert.deepStrictEqual(titles, ['a']) // only rows OLDER than b
  assert.ok(!titles.includes('c'))
  assert.notStrictEqual(a, b)
})

test('a malformed before_id is ignored (first page), never a 500 on the uuid column', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  await insertNotif(app, me.row.id, { title: 'only' })

  const res = await app.inject({
    method: 'GET',
    url: `${feedUrl}?before_id=not-a-uuid`,
    headers: authHeader(me.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json().notifications.map((n: { title: string }) => n.title), ['only'])
})

// ---------- feed: announcement targeting (fan-out-on-read) ----------------------

test('feed includes an untargeted announcement and one matching the viewer; excludes mismatches', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app, { role: 'user', country: 'NG', city: 'Lagos' })
  const everyone = await insertAnn(app, { title: 'everyone' })
  const myCity = await insertAnn(app, { title: 'lagos', target: 'city', target_value: 'Lagos' })
  const myCountry = await insertAnn(app, { title: 'nigeria', target: 'country', target_value: 'NG' })
  await insertAnn(app, { title: 'nairobi', target: 'city', target_value: 'Nairobi' }) // mismatch
  await insertAnn(app, { title: 'admins', target: 'role', target_value: 'super_admin' }) // mismatch
  await insertAnn(app, { title: 'inactive', is_active: false })
  await insertAnn(app, { title: 'expired', expires_at: new Date(Date.now() - 1000) })

  const res = await app.inject({ method: 'GET', url: feedUrl, headers: authHeader(me.token) })
  const ids = new Set(res.json().announcements.map((a: { id: string }) => a.id))
  assert.deepStrictEqual(ids, new Set([everyone, myCity, myCountry]))
})

test('a country-targeted announcement never matches a viewer with a null country', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app, { country: null, city: null })
  await insertAnn(app, { title: 'nigeria', target: 'country', target_value: 'NG' })
  const everyone = await insertAnn(app, { title: 'everyone' })

  const res = await app.inject({ method: 'GET', url: feedUrl, headers: authHeader(me.token) })
  const ids = res.json().announcements.map((a: { id: string }) => a.id)
  assert.deepStrictEqual(ids, [everyone])
})

// ---------- unread count --------------------------------------------------------

test('unread_count sums unread notifications + unread (post-cursor) announcements', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  await insertNotif(app, me.row.id) // unread
  await insertNotif(app, me.row.id, { read_at: new Date() }) // read — excluded
  await insertAnn(app, { title: 'live' }) // unread announcement (cursor null → all count)

  const res = await app.inject({ method: 'GET', url: `${feedUrl}/unread-count`, headers: authHeader(me.token) })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().count, 2)
  // Feed's embedded count agrees.
  const feed = await app.inject({ method: 'GET', url: feedUrl, headers: authHeader(me.token) })
  assert.strictEqual(feed.json().unread_count, 2)
})

// ---------- mark one read -------------------------------------------------------

test('POST /:id/read marks the caller\'s own notification (idempotent); 404 for others', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const other = await createUser(app)
  const mine = await insertNotif(app, me.row.id)
  const theirs = await insertNotif(app, other.row.id)

  const ok = await app.inject({ method: 'POST', url: `${feedUrl}/${mine}/read`, headers: authHeader(me.token) })
  assert.strictEqual(ok.statusCode, 200)
  const [row] = await app.db.select().from(notifications).where(eq(notifications.id, mine))
  assert.notStrictEqual(row.read_at, null)

  // Idempotent second call still 200.
  const again = await app.inject({ method: 'POST', url: `${feedUrl}/${mine}/read`, headers: authHeader(me.token) })
  assert.strictEqual(again.statusCode, 200)

  // Another user's notification → 404 (and stays unread).
  const forbidden = await app.inject({ method: 'POST', url: `${feedUrl}/${theirs}/read`, headers: authHeader(me.token) })
  assert.strictEqual(forbidden.statusCode, 404)
  const [t] = await app.db.select().from(notifications).where(eq(notifications.id, theirs))
  assert.strictEqual(t.read_at, null)

  // Nonexistent id → 404.
  const missing = await app.inject({ method: 'POST', url: `${feedUrl}/${randomUUID()}/read`, headers: authHeader(me.token) })
  assert.strictEqual(missing.statusCode, 404)

  // Malformed (non-UUID) id → 404, NOT a 500 on the uuid column.
  const malformed = await app.inject({ method: 'POST', url: `${feedUrl}/not-a-uuid/read`, headers: authHeader(me.token) })
  assert.strictEqual(malformed.statusCode, 404)
})

// ---------- mark all read -------------------------------------------------------

test('POST /read-all clears the badge: notifications read + announcement cursor advanced', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  await insertNotif(app, me.row.id)
  await insertNotif(app, me.row.id)
  await insertAnn(app, { title: 'live' })

  const before = await app.inject({ method: 'GET', url: `${feedUrl}/unread-count`, headers: authHeader(me.token) })
  assert.strictEqual(before.json().count, 3)

  const res = await app.inject({ method: 'POST', url: `${feedUrl}/read-all`, headers: authHeader(me.token) })
  assert.strictEqual(res.statusCode, 200)

  const after = await app.inject({ method: 'GET', url: `${feedUrl}/unread-count`, headers: authHeader(me.token) })
  assert.strictEqual(after.json().count, 0)
})

// The reported bug: the badge cleared but the broadcast stayed pinned at the
// top of the list for good, so every personal notice that arrived afterwards
// rendered beneath it. The feed and the count now share one predicate.
test('read-all UNPINS the broadcast: a cleared announcement leaves the feed, not just the count', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  const stale = await insertAnn(app, { title: 'maintenance' })

  const before = await app.inject({ method: 'GET', url: feedUrl, headers: authHeader(me.token) })
  assert.deepStrictEqual(
    before.json().announcements.map((a: { id: string }) => a.id),
    [stale],
    'precondition: an uncleared broadcast is pinned',
  )

  await app.inject({ method: 'POST', url: `${feedUrl}/read-all`, headers: authHeader(me.token) })

  // A personal notice that arrives AFTER the clear is what used to be buried.
  await insertNotif(app, me.row.id, { title: 'newer' })
  const after = await app.inject({ method: 'GET', url: feedUrl, headers: authHeader(me.token) })
  assert.deepStrictEqual(after.json().announcements, [], 'the cleared broadcast is gone from the feed')
  assert.deepStrictEqual(after.json().notifications.map((n: { title: string }) => n.title), ['newer'])
})

test('the pinned set is exactly the counted set, before and after read-all', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app) // no personal notices, so the count IS the broadcast count
  await insertAnn(app, { title: 'one' })
  await insertAnn(app, { title: 'two' })

  const before = await app.inject({ method: 'GET', url: feedUrl, headers: authHeader(me.token) })
  assert.strictEqual(before.json().announcements.length, 2)
  assert.strictEqual(before.json().unread_count, 2)

  await app.inject({ method: 'POST', url: `${feedUrl}/read-all`, headers: authHeader(me.token) })

  const after = await app.inject({ method: 'GET', url: feedUrl, headers: authHeader(me.token) })
  assert.strictEqual(after.json().announcements.length, 0)
  assert.strictEqual(after.json().unread_count, 0)
})

test('an announcement published AFTER read-all counts as unread again', { skip }, async () => {
  const app = getApp()
  const me = await createUser(app)
  await app.inject({ method: 'POST', url: `${feedUrl}/read-all`, headers: authHeader(me.token) })
  // Published strictly after the just-set cursor (future ts avoids ms-granularity flake).
  await insertAnn(app, { title: 'fresh', published_at: new Date(Date.now() + 60_000) })

  const res = await app.inject({ method: 'GET', url: `${feedUrl}/unread-count`, headers: authHeader(me.token) })
  assert.strictEqual(res.json().count, 1)

  // ...and is pinned again, not merely counted: clearing must not be permanent
  // for broadcasts published later.
  const feed = await app.inject({ method: 'GET', url: feedUrl, headers: authHeader(me.token) })
  assert.deepStrictEqual(feed.json().announcements.map((a: { title: string }) => a.title), ['fresh'])
})
