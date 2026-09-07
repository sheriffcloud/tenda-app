/**
 * lib/notify/ — the notification WRITE contract. Three things are pinned
 * here because nothing else pins them:
 *
 *  1. `stableNotificationId` must return a WELL-FORMED UUID. `notifications.id`
 *     is a postgres `uuid` column, so a readable key like `alert.<id>.<user>`
 *     fails at INSERT time inside the delivery worker — i.e. on every retry,
 *     forever, with no user-visible signal. A shape regression here is silent
 *     in dev and total in production.
 *  2. The `id` guard in `enqueueNotification` moves that failure to the
 *     producer, where a test or a dev hits it immediately.
 *  3. The `*PushData` builders are the single server-side declaration of the
 *     deep-link contract the mobile resolver reads. Nine call sites used to
 *     hand-write these bags, so a key rename (`escrowId` → `escrow_id`) broke
 *     routing with nothing failing.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { NOTIFICATION_SCREEN } from '@tenda/shared'
import { isUuidLike } from '@server/lib/uuid'
import {
  stableNotificationId,
  enqueueNotification,
  enqueueNotificationToMany,
  escrowPushData,
  disputePushData,
  chatPushData,
  fiatIntentPushData,
  toNotificationWire,
} from '@server/lib/notify'
import { queueDouble } from '../helpers/queue-double'

// ---------- helpers ----------------------------------------------------------

const UUID_A = '550e8400-e29b-41d4-a716-446655440000'

// ---------- stableNotificationId ---------------------------------------------

test('stableNotificationId: same parts produce the same id (idempotency premise)', () => {
  const a = stableNotificationId('dispute-alert', UUID_A, 'admin-inbox')
  const b = stableNotificationId('dispute-alert', UUID_A, 'admin-inbox')
  assert.strictEqual(a, b)
})

test('stableNotificationId: different parts produce different ids', () => {
  const a = stableNotificationId('dispute-alert', UUID_A, 'admin-inbox')
  const b = stableNotificationId('dispute-alert', UUID_A, 'email')
  assert.notStrictEqual(a, b, 'per-channel ids must not collide, or one channel silences the other')
})

// The reason the separator is NUL and not a space/dash: with a joinable
// separator these two argument lists hash the same string, so two DIFFERENT
// notices would share an id and the second would be dropped by
// onConflictDoNothing.
test('stableNotificationId: part boundaries are unambiguous (no join collision)', () => {
  assert.notStrictEqual(stableNotificationId('a', 'bc'), stableNotificationId('ab', 'c'))
})

test('stableNotificationId: output is a postgres-acceptable UUID', () => {
  const id = stableNotificationId('dispute-alert', UUID_A, 'slack')
  assert.ok(isUuidLike(id), `expected UUID shape, got ${id}`)
})

test('stableNotificationId: stamps RFC 9562 version 8 and the correct variant', () => {
  // Version nibble = first char of group 3; variant = first char of group 4
  // must be one of 8/9/a/b. Postgres accepts any hex, but a wrong variant makes
  // the id a lie about how it was derived.
  for (const parts of [['x'], ['a', 'b'], ['dispute-alert', UUID_A, 'email']]) {
    const groups = stableNotificationId(...parts).split('-')
    assert.strictEqual(groups[2][0], '8', 'version nibble')
    assert.match(groups[3][0], /[89ab]/, 'variant nibble')
  }
})

test('stableNotificationId: accepts a single part and an empty part list', () => {
  assert.ok(isUuidLike(stableNotificationId('solo')))
  assert.ok(isUuidLike(stableNotificationId()))
})

// ---------- enqueueNotification ----------------------------------------------

test('enqueueNotification: defaults to a random id and persists', async () => {
  const q = queueDouble()
  await enqueueNotification(q, { user_id: 'u1', title: 'T', body: 'B' })

  assert.strictEqual(q.calls.length, 1)
  // The queue name is read off `calls`, not `notifications()`: that accessor
  // filters ON the name, so asserting through it would assume the very thing
  // this line checks — a job sent to the wrong queue would read as no job.
  assert.strictEqual(q.calls[0].name, 'notifications')
  const [payload] = q.notifications()
  assert.strictEqual(payload.user_id, 'u1')
  assert.strictEqual(payload.persist, true, 'persist defaults to true')
  assert.ok(isUuidLike(payload.id))
})

test('enqueueNotification: two default enqueues get DIFFERENT ids', async () => {
  const q = queueDouble()
  await enqueueNotification(q, { user_id: 'u1', title: 'T', body: 'B' })
  await enqueueNotification(q, { user_id: 'u1', title: 'T', body: 'B' })
  assert.notStrictEqual(q.notifications()[0].id, q.notifications()[1].id)
})

// The whole point of the new field: a producer that can be re-run for the same
// logical notice pins the id, so the delivery worker's onConflictDoNothing
// collapses the re-run instead of writing a second row + second badge.
test('enqueueNotification: a supplied id is used verbatim', async () => {
  const q = queueDouble()
  const id = stableNotificationId('dispute-alert', UUID_A, 'admin-inbox')
  await enqueueNotification(q, { user_id: 'u1', title: 'T', body: 'B', id })
  assert.strictEqual(q.notifications()[0].id, id)
})

test('enqueueNotification: rejects a non-UUID id at the producer', async () => {
  const q = queueDouble()
  await assert.rejects(
    () =>
      enqueueNotification(q, {
        user_id: 'u1',
        title: 'T',
        body: 'B',
        id: 'dispute-alert.abc.admin-inbox',
      }),
    /must be a UUID/,
  )
  assert.strictEqual(q.calls.length, 0, 'the poison job never reaches the queue')
})

test('enqueueNotification: persist:false is preserved (chat stays out of the centre)', async () => {
  const q = queueDouble()
  await enqueueNotification(q, { user_id: 'u1', title: 'T', body: 'B', persist: false })
  assert.strictEqual(q.notifications()[0].persist, false)
})

test('enqueueNotification: omits `data` entirely when the caller gives none', async () => {
  const q = queueDouble()
  await enqueueNotification(q, { user_id: 'u1', title: 'T', body: 'B' })
  assert.ok(!('data' in q.notifications()[0]), 'absent, not an empty object')
})

test('enqueueNotification: forwards queue options (job_id dedup, delay)', async () => {
  const q = queueDouble()
  await enqueueNotification(q, { user_id: 'u1', title: 'T', body: 'B' }, { job_id: 'k', delay_ms: 5 })
  assert.deepStrictEqual(q.calls[0].opts, { job_id: 'k', delay_ms: 5 })
})

// ---------- enqueueNotificationToMany -----------------------------------------

test('enqueueNotificationToMany: one job per recipient, in the order given', async () => {
  const q = queueDouble()
  await enqueueNotificationToMany(q, ['u1', 'u2', 'u3'], { title: 'T', body: 'B' })
  assert.deepStrictEqual(
    q.notifications().map((n) => n.user_id),
    ['u1', 'u2', 'u3'],
  )
})

test('enqueueNotificationToMany: skips null recipients without enqueuing for them', async () => {
  const q = queueDouble()
  // An unassigned counterparty reaches this as null; callers must not have to
  // filter at every site.
  await enqueueNotificationToMany(q, ['u1', null, 'u2'], { title: 'T', body: 'B' })
  assert.strictEqual(q.calls.length, 2)
  assert.deepStrictEqual(
    q.notifications().map((n) => n.user_id),
    ['u1', 'u2'],
  )
})

test('enqueueNotificationToMany: an all-null list enqueues nothing', async () => {
  const q = queueDouble()
  await enqueueNotificationToMany(q, [null, null], { title: 'T', body: 'B' })
  assert.strictEqual(q.calls.length, 0)
})

// ---------- one round trip, not N -------------------------------------------

test('enqueueNotificationToMany: sends ONE batch, not one call per recipient', async () => {
  const q = queueDouble()
  await enqueueNotificationToMany(q, ['u1', 'u2', 'u3', 'u4'], { title: 'T', body: 'B' })

  // The point of the change, and the only assertion that can see it: `calls`
  // flattens bulk jobs, so a producer that looped `enqueue` four times looks
  // identical there. One batch of four is what "the Redis round trip is paid
  // once" means.
  assert.deepStrictEqual(q.bulkBatchSizes, [4])
  assert.strictEqual(q.calls.length, 4, 'and every recipient is still in it')
})

test('enqueueNotificationToMany: an empty batch never reaches the queue at all', async () => {
  const q = queueDouble()
  await enqueueNotificationToMany(q, [null, null], { title: 'T', body: 'B' })

  // Not the same claim as "enqueues nothing" above. On a box with no REDIS_URL
  // the plugin's stub THROWS on any call, so a fan-out whose recipients were
  // all null would start failing a case that used to succeed by doing nothing —
  // the old loop simply never iterated. This pins the early return that keeps
  // that true.
  assert.deepStrictEqual(q.bulkBatchSizes, [], 'the queue was not called')
})

test('enqueueNotificationToMany: a rejected id means NO batch is sent', async () => {
  const q = queueDouble()
  await assert.rejects(
    () =>
      enqueueNotificationToMany(q, ['u1', 'u2', 'u3'], {
        title: 'T',
        body: 'B',
        idFor: (uid) => (uid === 'u3' ? 'not-a-uuid' : stableNotificationId('alert', UUID_A, uid)),
      }),
    /must be a UUID/,
  )
  // The all-or-nothing guarantee, stated against the seam that now carries it:
  // `calls` being empty would also hold if the batch were sent and the double
  // recorded nothing, so assert the call itself never happened.
  assert.deepStrictEqual(q.bulkBatchSizes, [])
})

test('enqueueNotificationToMany: every recipient gets the same data bag', async () => {
  const q = queueDouble()
  const data = escrowPushData('e1', 'gig')
  await enqueueNotificationToMany(q, ['u1', 'u2'], { title: 'T', body: 'B', data })
  assert.deepStrictEqual(q.notifications()[0].data, data)
  assert.deepStrictEqual(q.notifications()[1].data, data)
})

test('enqueueNotificationToMany: omits `data` entirely when the caller gives none', async () => {
  const q = queueDouble()
  await enqueueNotificationToMany(q, ['u1'], { title: 'T', body: 'B' })
  assert.ok(!('data' in q.notifications()[0]), 'absent, not an empty object')
})

test('enqueueNotificationToMany: defaults persist to true, and honours an explicit false', async () => {
  const on = queueDouble()
  await enqueueNotificationToMany(on, ['u1'], { title: 'T', body: 'B' })
  assert.strictEqual(on.notifications()[0].persist, true)

  const off = queueDouble()
  await enqueueNotificationToMany(off, ['u1'], { title: 'T', body: 'B', persist: false })
  assert.strictEqual(off.notifications()[0].persist, false)
})

test('enqueueNotificationToMany: idFor stamps a DISTINCT id per recipient', async () => {
  const q = queueDouble()
  await enqueueNotificationToMany(q, ['u1', 'u2'], {
    title: 'T',
    body: 'B',
    idFor: (uid) => stableNotificationId('alert', UUID_A, uid),
  })
  const [a, b] = q.notifications().map((n) => n.id)
  assert.strictEqual(a, stableNotificationId('alert', UUID_A, 'u1'))
  // The reason idFor is a function and not a string: one shared id would let
  // persistNotification's onConflictDoNothing drop everyone after the first.
  assert.notStrictEqual(a, b, 'a shared id would silently notify only one recipient')
})

test('enqueueNotificationToMany: idFor is re-run per fan-out, so a retry re-uses the same ids', async () => {
  const idFor = (uid: string): string => stableNotificationId('alert', UUID_A, uid)
  const first = queueDouble()
  const second = queueDouble()
  await enqueueNotificationToMany(first, ['u1', 'u2'], { title: 'T', body: 'B', idFor })
  await enqueueNotificationToMany(second, ['u1', 'u2'], { title: 'T', body: 'B', idFor })
  assert.deepStrictEqual(
    first.notifications().map((n) => n.id),
    second.notifications().map((n) => n.id),
  )
})

test('enqueueNotificationToMany: without idFor, ids are unique per recipient', async () => {
  const q = queueDouble()
  await enqueueNotificationToMany(q, ['u1', 'u2'], { title: 'T', body: 'B' })
  const [a, b] = q.notifications().map((n) => n.id)
  assert.notStrictEqual(a, b, 'random ids must not collide across recipients')
})

test('enqueueNotificationToMany: a malformed idFor result is rejected at the producer', async () => {
  const q = queueDouble()
  // Same guard enqueueNotification applies: a non-UUID id only fails at INSERT,
  // inside a worker nobody is watching, on every retry forever.
  await assert.rejects(
    () => enqueueNotificationToMany(q, ['u1'], { title: 'T', body: 'B', idFor: () => 'not-a-uuid' }),
    /must be a UUID/,
  )
  assert.strictEqual(q.calls.length, 0, 'nothing should be enqueued once the id is rejected')
})

test('enqueueNotificationToMany: a bad id on a LATER recipient enqueues NOTHING', async () => {
  const q = queueDouble()
  // The real guarantee. Validating inside the loop would have already enqueued
  // u1 and u2 by the time u3 throws, leaving a partial fan-out that nothing
  // downstream can detect — half the recipients notified, silently.
  await assert.rejects(
    () =>
      enqueueNotificationToMany(q, ['u1', 'u2', 'u3'], {
        title: 'T',
        body: 'B',
        idFor: (uid) => (uid === 'u3' ? 'not-a-uuid' : stableNotificationId('alert', UUID_A, uid)),
      }),
    /must be a UUID/,
  )
  assert.strictEqual(q.calls.length, 0, 'a partial fan-out is worse than none')
})

test('enqueueNotificationToMany: idFor runs once per recipient, before any enqueue', async () => {
  const q = queueDouble()
  const seen: string[] = []
  await enqueueNotificationToMany(q, ['u1', null, 'u2'], {
    title: 'T',
    body: 'B',
    idFor: (uid) => {
      seen.push(uid)
      return stableNotificationId('alert', UUID_A, uid)
    },
  })
  // Nulls never reach idFor, and no id is computed twice.
  assert.deepStrictEqual(seen, ['u1', 'u2'])
})

// ---------- push-data builders ------------------------------------------------

test('escrowPushData: gig and exchange differ only by kind', () => {
  assert.deepStrictEqual(escrowPushData('e1', 'gig'), {
    screen: NOTIFICATION_SCREEN.escrow,
    escrowId: 'e1',
    kind: 'gig',
  })
  assert.strictEqual(escrowPushData('e1', 'exchange').kind, 'exchange')
})

test('disputePushData: carries BOTH ids — mobile routes by escrow, admin by dispute', () => {
  assert.deepStrictEqual(disputePushData('e1', 'd1'), {
    screen: NOTIFICATION_SCREEN.dispute,
    escrowId: 'e1',
    disputeId: 'd1',
  })
})

// An escrow can be `disputed` on-chain with no off-chain `disputes` row yet.
// Omitting the key is the honest answer; inventing one would deep-link the
// dashboard to a 404.
test('disputePushData: omits disputeId when there is no dispute row', () => {
  const data = disputePushData('e1', null)
  assert.deepStrictEqual(data, { screen: NOTIFICATION_SCREEN.dispute, escrowId: 'e1' })
  assert.ok(!('disputeId' in data))
})

test('chatPushData: userId is the SENDER, not the recipient', () => {
  assert.deepStrictEqual(chatPushData('c1', 'sender-1'), {
    screen: NOTIFICATION_SCREEN.chat,
    conversationId: 'c1',
    userId: 'sender-1',
  })
})

test('fiatIntentPushData: deep-links the intent', () => {
  assert.deepStrictEqual(fiatIntentPushData('i1'), {
    screen: NOTIFICATION_SCREEN.fiatIntent,
    intentId: 'i1',
  })
})

// Drift guard: the rule is ONE builder per screen. A screen added to the shared
// vocabulary with no builder means a producer will hand-write the bag again —
// exactly the drift this module exists to stop.
test('every NOTIFICATION_SCREEN member has a builder that emits it', () => {
  const emitted = new Set(
    [
      escrowPushData('e', 'gig'),
      disputePushData('e', 'd'),
      chatPushData('c', 'u'),
      fiatIntentPushData('i'),
    ].map((d) => d.screen),
  )
  assert.deepStrictEqual(
    [...emitted].sort(),
    Object.values(NOTIFICATION_SCREEN).slice().sort(),
  )
})

test('every builder emits a non-empty string for every key', () => {
  for (const data of [
    escrowPushData('e', 'gig'),
    disputePushData('e', 'd'),
    disputePushData('e', null),
    chatPushData('c', 'u'),
    fiatIntentPushData('i'),
  ]) {
    for (const [k, v] of Object.entries(data)) {
      assert.strictEqual(typeof v, 'string', `${k} must be a string (jsonb<Record<string,string>>)`)
      assert.ok(v.length > 0, `${k} must not be empty`)
    }
  }
})

// ---------- toNotificationWire ------------------------------------------------

test('toNotificationWire: nulls survive as null, dates become ISO strings', () => {
  const created = new Date('2026-08-03T10:00:00.000Z')
  const wire = toNotificationWire({
    id: UUID_A,
    user_id: 'u1',
    title: 'T',
    body: 'B',
    data: null,
    read_at: null,
    created_at: created,
  })
  assert.deepStrictEqual(wire, {
    id: UUID_A,
    title: 'T',
    body: 'B',
    data: null,
    read_at: null,
    created_at: '2026-08-03T10:00:00.000Z',
  })
})

test('toNotificationWire: a read notification carries its read_at', () => {
  const wire = toNotificationWire({
    id: UUID_A,
    user_id: 'u1',
    title: 'T',
    body: 'B',
    data: escrowPushData('e1', 'gig'),
    read_at: new Date('2026-08-03T11:00:00.000Z'),
    created_at: new Date('2026-08-03T10:00:00.000Z'),
  })
  assert.strictEqual(wire.read_at, '2026-08-03T11:00:00.000Z')
  assert.deepStrictEqual(wire.data, { screen: 'escrow', escrowId: 'e1', kind: 'gig' })
})
