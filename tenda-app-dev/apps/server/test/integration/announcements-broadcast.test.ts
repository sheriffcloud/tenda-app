/**
 * Stage 4 — admin broadcast write path + the public-feed leak fix + retention.
 *
 *  - POST /v1/admin/announcements persists targeting and (optionally) pushes,
 *    via the shared createAnnouncement helper.
 *  - A targeted announcement is private: it reaches its audience's authenticated
 *    feed (GET /v1/notifications) but NEVER the unauthenticated public list
 *    (GET /v1/announcements) — the leak fix.
 *  - POST /v1/admin/push/broadcast leaves an in-app announcement (readable
 *    after the push) instead of vanishing.
 *  - handleNotificationRetention prunes stale personal notifications.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { notifications, device_tokens } from '@tenda/shared/db/schema'
import { handleNotificationRetention } from '@server/workers/notification-retention'
import {
  NOTIFICATION_RETENTION_READ_DAYS,
  NOTIFICATION_RETENTION_MAX_DAYS,
} from '@tenda/shared'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const ADMIN_URL = '/v1/admin/announcements'
const PUBLIC_URL = '/v1/announcements'
const FEED_URL = '/v1/notifications'

interface CreateBody {
  title?: string
  body?: string
  target?: string
  target_value?: string
  priority?: number
  is_active?: boolean
  push?: boolean
}

async function adminCreate(app: FastifyInstance, token: string, o: CreateBody = {}) {
  return app.inject({
    method: 'POST',
    url: ADMIN_URL,
    headers: authHeader(token),
    payload: { title: o.title ?? 'Notice', body: o.body ?? 'Body', ...o },
  })
}

async function publicIds(app: FastifyInstance): Promise<Set<string>> {
  const res = await app.inject({ method: 'GET', url: PUBLIC_URL })
  return new Set(res.json().data.map((a: { id: string }) => a.id))
}

async function feedAnnouncementIds(app: FastifyInstance, token: string): Promise<Set<string>> {
  const res = await app.inject({ method: 'GET', url: FEED_URL, headers: authHeader(token) })
  return new Set(res.json().announcements.map((a: { id: string }) => a.id))
}

const DAY_MS = 24 * 3_600_000

async function insertNotif(app: FastifyInstance, userId: string, created_at: Date, read_at: Date | null): Promise<string> {
  const id = randomUUID()
  await app.db.insert(notifications).values({
    id,
    user_id: userId,
    title: 'T',
    body: 'B',
    created_at,
    ...(read_at !== null ? { read_at } : {}),
  })
  return id
}

// ---------- admin auth ----------------------------------------------------------

test('POST /admin/announcements rejects a non-admin (403) and anon (401)', { skip }, async () => {
  const app = getApp()
  const anon = await app.inject({ method: 'POST', url: ADMIN_URL, payload: { title: 't', body: 'b' } })
  assert.strictEqual(anon.statusCode, 401)

  const user = await createUser(app, { role: 'user' })
  const forbidden = await adminCreate(app, user.token, {})
  assert.strictEqual(forbidden.statusCode, 403)
})

// ---------- targeting validation ------------------------------------------------

test('an unknown target is rejected (400); a concrete target needs a value (400)', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })

  const badTarget = await adminCreate(app, admin.token, { target: 'galaxy', target_value: 'x' })
  assert.strictEqual(badTarget.statusCode, 400)

  const missingValue = await adminCreate(app, admin.token, { target: 'city' })
  assert.strictEqual(missingValue.statusCode, 400)
})

// ---------- everyone vs targeted (leak fix) -------------------------------------

test('an everyone-announcement appears on the public list; a city-targeted one never does', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })

  const everyone = (await adminCreate(app, admin.token, { title: 'all' })).json() as { id: string }
  const lagos = (await adminCreate(app, admin.token, { title: 'lagos', target: 'city', target_value: 'Lagos' })).json() as { id: string }

  const ids = await publicIds(app)
  assert.ok(ids.has(everyone.id), 'everyone-announcement should be public')
  assert.ok(!ids.has(lagos.id), 'city-targeted announcement must not leak to the public list')
})

test('a targeted announcement reaches its audience feed but not a mismatched viewer', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const lagosUser = await createUser(app, { role: 'user', country: 'NG', city: 'Lagos' })
  const otherUser = await createUser(app, { role: 'user', country: 'NG', city: 'Abuja' })

  const lagos = (await adminCreate(app, admin.token, { title: 'lagos', target: 'city', target_value: 'Lagos' })).json() as { id: string }

  assert.ok((await feedAnnouncementIds(app, lagosUser.token)).has(lagos.id), 'Lagos viewer should see it')
  assert.ok(!(await feedAnnouncementIds(app, otherUser.token)).has(lagos.id), 'Abuja viewer should not')
})

// ---------- push broadcast leaves an in-app trace -------------------------------

test('POST /admin/push/broadcast persists a readable announcement (attempted 0 with no devices)', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const viewer = await createUser(app, { role: 'user' })

  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/push/broadcast',
    headers: authHeader(admin.token),
    payload: { title: 'Flash', body: 'Sale', target: 'all' },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().attempted, 0) // no device tokens registered

  // The broadcast is now readable in-app (everyone target → any viewer sees it).
  const feed = await app.inject({ method: 'GET', url: FEED_URL, headers: authHeader(viewer.token) })
  const titles = feed.json().announcements.map((a: { title: string }) => a.title)
  assert.ok(titles.includes('Flash'), 'push broadcast should be readable in the in-app feed')
})

test('a role broadcast resolves that role\'s device tokens (attempted count)', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const member = await createUser(app, { role: 'user' })
  // A non-Expo-prefixed token: it is resolved + counted, but sendPush filters it
  // out before any network call — so this asserts the audience join, not Expo.
  await app.db.insert(device_tokens).values({ user_id: member.row.id, token: 'not-a-real-expo-token', platform: 'expo' })

  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/push/broadcast',
    headers: authHeader(admin.token),
    payload: { title: 'Hi', body: 'members', target: 'role', target_value: 'user' },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().attempted, 1)
})

// ---------- retention sweep -----------------------------------------------------

test('retention prunes read>60d and any>180d, keeps recent unread + recent read', { skip }, async () => {
  const app = getApp()
  const user = await createUser(app, { role: 'user' })
  const now = new Date()
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS)

  const recentUnread = await insertNotif(app, user.row.id, daysAgo(1), null)
  const recentRead = await insertNotif(app, user.row.id, daysAgo(10), daysAgo(5))
  const staleRead = await insertNotif(app, user.row.id, daysAgo(90), daysAgo(NOTIFICATION_RETENTION_READ_DAYS + 5))
  const ancientUnread = await insertNotif(app, user.row.id, daysAgo(NOTIFICATION_RETENTION_MAX_DAYS + 5), null)

  const { pruned } = await handleNotificationRetention({
    db: app.db,
    log: { info() {} },
    now: () => now,
  })
  assert.strictEqual(pruned, 2)

  const remaining = new Set(
    (await app.db.select({ id: notifications.id }).from(notifications).where(eq(notifications.user_id, user.row.id)))
      .map((r) => r.id),
  )
  assert.deepStrictEqual(remaining, new Set([recentUnread, recentRead]))
  assert.ok(!remaining.has(staleRead) && !remaining.has(ancientUnread))
})
