/** Notification delivery integration: persistence, push, pruning, and idempotency. */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { device_tokens, notifications } from '@tenda/shared/db/schema'
import { NOTIFICATION_BODY_MAX } from '@tenda/shared'
import { buildProcessors, removeTokens } from '@server/workers/processors'
import type { DevicePlatform } from '@server/lib/push-services'
import type { PushService } from '@server/chains/types'
import type { JobPayload } from '@server/plugins/queue'
import { channelName } from '@server/lib/ws'
import { installCapture, type SideEffectCapture } from '../helpers/side-effects'
import { restoreFetch, stubExpoPush } from '../helpers/fetch-stub'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- side-effect capture -------------------------------------------------
// The queue + WS seam lives in helpers/side-effects, shared with the other
// fan-out suites so "what counts as notifying someone" is defined once.

let cap: SideEffectCapture
beforeEach(() => {
  if (skip) return
  cap = installCapture(getApp())
})

/**
 * A delivery-job payload with a stamped id (as `enqueueNotification` would).
 * Defaults `persist:false` so the token-delivery tests stay pure push tests;
 * the persistence tests opt in with `persist:true`.
 */
function notifJob(
  overrides: Partial<JobPayload['notifications']> & { user_id: string },
): JobPayload['notifications'] {
  return { id: randomUUID(), title: 't', body: 'b', persist: false, ...overrides }
}

/** All notification frames broadcast on a given user's channel. */
function userFrames(userId: string): Array<{ channel: string; payload: Record<string, unknown> }> {
  return cap.broadcasts.filter((b) => b.channel === channelName({ kind: 'user', id: userId }))
}

// ---------- deliverNotification + removeTokens ----------------------------------

test('notifications: a user with no device tokens delivers nothing (no throw)', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await buildProcessors(app).notifications(notifJob({ user_id: u.row.id }))
  // No tokens, no prune target — the row set is unchanged (empty).
  const rows = await app.db.select().from(device_tokens).where(eq(device_tokens.user_id, u.row.id))
  assert.strictEqual(rows.length, 0)
})

test('notifications: an unconfigured platform counts failed but never prunes the token', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  // FCM is not configured in the harness → routePush degrades it as failed,
  // NOT as a dead token, so the row must survive.
  await app.db.insert(device_tokens).values({ user_id: u.row.id, token: 'fcm-tok', platform: 'fcm' })
  await buildProcessors(app).notifications(notifJob({ user_id: u.row.id }))

  const rows = await app.db.select().from(device_tokens).where(eq(device_tokens.user_id, u.row.id))
  assert.strictEqual(rows.length, 1)
})

test('notifications: an Expo DeviceNotRegistered token is pruned, the live one kept', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await app.db.insert(device_tokens).values([
    { user_id: u.row.id, token: 'ExponentPushToken[live]', platform: 'expo' },
    { user_id: u.row.id, token: 'ExponentPushToken[gone]', platform: 'expo' },
  ])

  stubExpoPush((token) => (token.includes('gone') ? 'DeviceNotRegistered' : 'ok'))

  try {
    await buildProcessors(app).notifications(notifJob({ user_id: u.row.id, data: { k: 'v' } }))
  } finally {
    restoreFetch()
  }

  const rows = await app.db.select().from(device_tokens).where(eq(device_tokens.user_id, u.row.id))
  assert.deepStrictEqual(
    rows.map((r) => r.token),
    ['ExponentPushToken[live]'],
  )
})

test('every notification delivery reuses the ONE services instance from buildProcessors (token cache survives)', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await app.db.insert(device_tokens).values({ user_id: u.row.id, token: 'fcm-a', platform: 'fcm' })

  // A single injected services object with a counting fcm transport. Both
  // deliveries must route through THIS instance — proving deliverNotification
  // uses the services built once by buildProcessors, not a per-delivery
  // rebuild (which would discard the FCM OAuth / APNS JWT token cache).
  let sends = 0
  const services: Partial<Record<DevicePlatform, PushService>> = {
    fcm: {
      async send() {
        sends += 1
        return { ok: 1, failed: 0, invalid_tokens: [] }
      },
    },
  }

  const procs = buildProcessors(app, services)
  await procs.notifications(notifJob({ user_id: u.row.id, title: 't1', body: 'b1' }))
  await procs.notifications(notifJob({ user_id: u.row.id, title: 't2', body: 'b2' }))

  // If deliverNotification rebuilt services internally, the injected fcm
  // service would be ignored (expo-only default) → sends would stay 0.
  assert.strictEqual(sends, 2)
})

test('removeTokens deletes the listed tokens; an empty list is a no-op', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await app.db.insert(device_tokens).values([
    { user_id: u.row.id, token: 'keep-1', platform: 'expo' },
    { user_id: u.row.id, token: 'drop-1', platform: 'expo' },
  ])

  await removeTokens(app, []) // no-op — both survive
  assert.strictEqual(
    (await app.db.select().from(device_tokens).where(eq(device_tokens.user_id, u.row.id))).length,
    2,
  )

  await removeTokens(app, ['drop-1'])
  const rows = await app.db.select().from(device_tokens).where(eq(device_tokens.user_id, u.row.id))
  assert.deepStrictEqual(
    rows.map((r) => r.token),
    ['keep-1'],
  )
})

// ---------- deliverNotification: persistence + WS badge -------------------------

test('persist=true writes one row and broadcasts a NotificationFrame on the user channel', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const job = notifJob({
    user_id: u.row.id,
    title: 'Gig accepted',
    body: 'work underway',
    data: { screen: 'escrow', escrowId: 'e1', kind: 'gig' },
    persist: true,
  })
  await buildProcessors(app).notifications(job)

  const rows = await app.db.select().from(notifications).where(eq(notifications.user_id, u.row.id))
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].id, job.id)
  assert.strictEqual(rows[0].title, 'Gig accepted')
  assert.strictEqual(rows[0].read_at, null)
  assert.deepStrictEqual(rows[0].data, { screen: 'escrow', escrowId: 'e1', kind: 'gig' })

  const frames = userFrames(u.row.id)
  assert.strictEqual(frames.length, 1)
  assert.strictEqual(frames[0].payload.type, 'notification')
  const wire = (frames[0].payload as { notification: { id: string; read_at: string | null } }).notification
  assert.strictEqual(wire.id, job.id)
  assert.strictEqual(wire.read_at, null)
})

test('persist=false pushes but writes NO row and no notification frame', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await buildProcessors(app).notifications(notifJob({ user_id: u.row.id, persist: false }))
  const rows = await app.db.select().from(notifications).where(eq(notifications.user_id, u.row.id))
  assert.strictEqual(rows.length, 0)
  assert.strictEqual(userFrames(u.row.id).length, 0)
})

// Negative counterpart to 'delivering the SAME id twice is idempotent' below:
// same recipient, same copy, DIFFERENT id. Without this, a dedup that keyed on
// CONTENT instead of the id would pass that test while silently swallowing
// genuine repeat notices (two disputes on the same escrow, say).
test('two distinct ids for the same recipient both persist', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  await buildProcessors(app).notifications(notifJob({ user_id: u.row.id, persist: true }))
  await buildProcessors(app).notifications(notifJob({ user_id: u.row.id, persist: true }))

  const rows = await app.db.select().from(notifications).where(eq(notifications.user_id, u.row.id))
  assert.strictEqual(rows.length, 2)
  assert.strictEqual(userFrames(u.row.id).length, 2)
})

test('a persisted notification is written even when the user has NO device token', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  // No device_tokens row → persist must run BEFORE the no-token early return.
  await buildProcessors(app).notifications(notifJob({ user_id: u.row.id, persist: true }))
  assert.strictEqual(
    (await app.db.select().from(notifications).where(eq(notifications.user_id, u.row.id))).length,
    1,
  )
})

test('delivering the SAME id twice is idempotent — one row, no double badge', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const job = notifJob({ user_id: u.row.id, persist: true })
  await buildProcessors(app).notifications(job)
  await buildProcessors(app).notifications(job) // BullMQ retry — identical job.data

  assert.strictEqual(
    (await app.db.select().from(notifications).where(eq(notifications.user_id, u.row.id))).length,
    1,
  )
  // The retry must NOT re-broadcast, else the unread badge double-counts.
  assert.strictEqual(userFrames(u.row.id).length, 1)
})

test('delivering the SAME id twice sends ONE push — the retry is not re-delivered', { skip }, async () => {
  // The row and the badge were already idempotent; the PUSH was not, and that
  // is the half a user actually feels. It matters because the gig fan-out is
  // one retried job over many pages: a failure on a later page replays the
  // earlier ones, so every subscriber already reached gets a second buzz.
  //
  // Counts SENDS, not rows — the two existing idempotency tests above both
  // assert on `notifications` and `userFrames`, and both passed throughout the
  // window where every retry re-pushed. Nothing observed the wire.
  const app = getApp()
  const u = await createUser(app)
  await app.db
    .insert(device_tokens)
    .values({ user_id: u.row.id, token: 'ExponentPushToken[live]', platform: 'expo' })

  const pushed = stubExpoPush()

  const job = notifJob({ user_id: u.row.id, persist: true })
  try {
    await buildProcessors(app).notifications(job)
    assert.strictEqual(pushed.tokens.length, 1, 'the first delivery must actually push')
    await buildProcessors(app).notifications(job) // BullMQ retry — identical job.data
  } finally {
    restoreFetch()
  }

  assert.strictEqual(pushed.tokens.length, 1, 'the retry re-pushed — the recipient was buzzed twice')
})

test('persist=false still pushes on every attempt — the dedup keys on the ROW', { skip }, async () => {
  // The limit of this fix, pinned so it is not mistaken for something broader.
  // A chat notice writes no row, so there is nothing to conflict on and a retry
  // re-pushes. Fixing that needs a queue-level dedup key, not this one — see
  // #45's option (b). Asserting it here means the gap is documented by a test
  // rather than only by prose, and a future fix will have to update this.
  const app = getApp()
  const u = await createUser(app)
  await app.db
    .insert(device_tokens)
    .values({ user_id: u.row.id, token: 'ExponentPushToken[live]', platform: 'expo' })

  const pushed = stubExpoPush()

  const job = notifJob({ user_id: u.row.id, persist: false })
  try {
    await buildProcessors(app).notifications(job)
    await buildProcessors(app).notifications(job)
  } finally {
    restoreFetch()
  }

  assert.strictEqual(pushed.tokens.length, 2, 'persist=false has no row to dedup on — both attempts push')
})

test('an over-long body is clamped to the column cap (no numeric/length overflow 5xx)', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const longBody = 'x'.repeat(NOTIFICATION_BODY_MAX + 50)
  await buildProcessors(app).notifications(notifJob({ user_id: u.row.id, body: longBody, persist: true }))
  const rows = await app.db.select().from(notifications).where(eq(notifications.user_id, u.row.id))
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].body.length, NOTIFICATION_BODY_MAX)
})
