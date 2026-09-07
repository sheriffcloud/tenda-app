/**
 * New-gig fan-out to gig_subscriptions (workers/escrow-fanout/subscribers.ts).
 *
 * Deliberately an integration test: the matching is SQL — a wildcard sentinel
 * OR'd against the gig's city and category — so a fake store would assert the
 * query we wrote rather than the rows postgres returns. It also had NO test at
 * all before this file, while quietly deciding who hears about every new gig.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { device_tokens, gig_subscriptions, notifications, users } from '@tenda/shared/db/schema'
import { buildProcessors } from '@server/workers/processors'
import {
  fanOutEscrowEvent,
  SUBSCRIBER_PAGE_SIZE,
  type EscrowFanoutEvent,
} from '@server/workers/escrow-fanout'
import { installCapture, type SideEffectCapture } from '../helpers/side-effects'
import { drainSubscriberFanout } from '../helpers/fanout'
import { restoreFetch, stubExpoPush } from '../helpers/fetch-stub'
import { userFixture } from '../helpers/fixtures'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  attachGigDetails,
  attachExchangeDetails,
  type GigDetailsOverrides,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

type App = ReturnType<typeof getApp>

let capture: SideEffectCapture

beforeEach(() => {
  if (skip) return
  capture = installCapture(getApp())
})

async function subscribe(
  app: App,
  user_id: string,
  city: string,
  category: string,
): Promise<void> {
  await app.db.insert(gig_subscriptions).values({ user_id, city, category })
}

/** A gig escrow that has just gone live, plus the created republish event. */
async function createdGig(
  app: App,
  creator_id: string,
  details: GigDetailsOverrides = {},
) {
  const escrow = await createEscrow(app, {
    creator_id,
    status: 'open',
    escrow_ref: `ref-${Math.random().toString(36).slice(2)}`,
  })
  await attachGigDetails(app, escrow.id, details)
  return escrow
}

function createdEvent(escrow_id: string): EscrowFanoutEvent {
  return {
    internal_event: 'escrow.created',
    escrow_id,
    wire_event: 'EscrowCreated',
    tx_ref: `sig-${Math.random().toString(36).slice(2)}`,
    counterparty_id: null,
    passed_applicant_ids: [],
    revived_applicant_ids: [],
  }
}

/**
 * The whole created path: the republish, then the expansion job it enqueues.
 *
 * Both halves, because "who hears about a new gig" is the question this file
 * exists to answer and the hop is an implementation detail of how the answer
 * gets delivered. The hop ITSELF is asserted by the two tests below that call
 * `fanOutEscrowEvent` directly — using this helper there would be assuming the
 * very thing under test.
 */
async function created(app: App, escrow_id: string): Promise<void> {
  await fanOutEscrowEvent(app, createdEvent(escrow_id))
  await drainSubscriberFanout(app, capture)
}

// ── who matches ────────────────────────────────────────────────────────────

test('notifies exact city+category subscribers and wildcard subscribers', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const exact = await createUser(app)
  const anyCity = await createUser(app)
  const anyBoth = await createUser(app)

  await subscribe(app, exact.row.id, 'Lagos', 'service')
  await subscribe(app, anyCity.row.id, '*', 'service')
  await subscribe(app, anyBoth.row.id, '*', '*')

  const escrow = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  await created(app, escrow.id)

  assert.deepStrictEqual(
    capture.notifiedUserIds().sort(),
    [exact.row.id, anyCity.row.id, anyBoth.row.id].sort(),
  )
})

test('does NOT notify a different city or a different category', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const otherCity = await createUser(app)
  const otherCategory = await createUser(app)

  await subscribe(app, otherCity.row.id, 'Abuja', 'service')
  await subscribe(app, otherCategory.row.id, 'Lagos', 'delivery')

  const escrow = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  await created(app, escrow.id)

  assert.deepStrictEqual(capture.notifiedUserIds(), [])
})

test('a remote gig (no city) reaches wildcard subscribers only', { skip }, async () => {
  // Nobody subscribed to "Lagos" asked to hear about work that is nowhere.
  const app = getApp()
  const poster = await createUser(app)
  const cityWatcher = await createUser(app)
  const anyCity = await createUser(app)

  await subscribe(app, cityWatcher.row.id, 'Lagos', 'service')
  await subscribe(app, anyCity.row.id, '*', 'service')

  const escrow = await createdGig(app, poster.row.id, { city: null, remote: true })
  await created(app, escrow.id)

  assert.deepStrictEqual(capture.notifiedUserIds(), [anyCity.row.id])
})

test('the poster is never notified about their own gig', { skip }, async () => {
  // They subscribe like anyone else; they just already know they posted it.
  const app = getApp()
  const poster = await createUser(app)
  await subscribe(app, poster.row.id, '*', '*')

  const escrow = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  await created(app, escrow.id)

  assert.deepStrictEqual(capture.notifiedUserIds(), [])
})

test('a user whose several subscriptions all match is notified once', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const eager = await createUser(app)
  // Three rows, all matching the same gig — the unique constraint is on
  // (user_id, city, category), so this is a state a user can really reach.
  await subscribe(app, eager.row.id, 'Lagos', 'service')
  await subscribe(app, eager.row.id, '*', 'service')
  await subscribe(app, eager.row.id, '*', '*')

  const escrow = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  await created(app, escrow.id)

  assert.deepStrictEqual(capture.notifiedUserIds(), [eager.row.id])
})

// ── what they receive ──────────────────────────────────────────────────────

test('the notice names the gig and its city, and deep-links to the gig', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const watcher = await createUser(app)
  await subscribe(app, watcher.row.id, '*', '*')

  const escrow = await createdGig(app, poster.row.id, {
    title: 'Paint the fence',
    city: 'Lagos',
    category: 'service',
  })
  await created(app, escrow.id)

  assert.strictEqual(capture.notifications().length, 1)
  const [notice] = capture.notifications()
  assert.strictEqual(notice.title, 'New Gig Posted')
  assert.strictEqual(notice.body, '"Paint the fence" in Lagos')
  // kind rides along so the deep link resolves /gig/:id, not /exchange/:id.
  assert.deepStrictEqual(notice.data, {
    screen: 'escrow',
    escrowId: escrow.id,
    kind: 'gig',
  })
})

test('a remote gig reads as "Remote" rather than an empty place', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const watcher = await createUser(app)
  await subscribe(app, watcher.row.id, '*', '*')

  const escrow = await createdGig(app, poster.row.id, { title: 'Write copy', city: null, remote: true })
  await created(app, escrow.id)

  assert.strictEqual(capture.notifications()[0].body, '"Write copy" in Remote')
})

// ── what must stay silent ──────────────────────────────────────────────────

test('an exchange escrow fans out to nobody (it has no gig_details row)', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const watcher = await createUser(app)
  await subscribe(app, watcher.row.id, '*', '*')

  const escrow = await createEscrow(app, {
    creator_id: poster.row.id,
    kind: 'exchange',
    status: 'open',
    escrow_ref: `ref-${Math.random().toString(36).slice(2)}`,
  })
  await attachExchangeDetails(app, escrow.id)

  await created(app, escrow.id)

  assert.deepStrictEqual(capture.notifiedUserIds(), [])
})

test('created fans out to subscribers ONLY — no party notice rides along', { skip }, async () => {
  // The early return after the subscriber fan-out is what keeps a poster from
  // being told about the escrow they just signed for.
  const app = getApp()
  const poster = await createUser(app)
  const watcher = await createUser(app)
  await subscribe(app, watcher.row.id, '*', '*')

  const escrow = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  await created(app, escrow.id)

  assert.deepStrictEqual(capture.notifiedUserIds(), [watcher.row.id])
})

// ── the queue hop ──────────────────────────────────────────────────────────
//
// These call `fanOutEscrowEvent` WITHOUT draining, because what they assert is
// that it did not do the expansion itself. The republish runs on a verify-tx
// worker slot — 8 for the whole app — so any per-subscriber work here is work a
// user waiting on a TransactionMonitor is queued behind.

test('the republish enqueues ONE expansion job and notifies nobody itself', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  // Three matching subscribers, so "no notifications" cannot pass by there
  // being nobody to notify.
  for (let i = 0; i < 3; i++) {
    const watcher = await createUser(app)
    await subscribe(app, watcher.row.id, '*', '*')
  }

  const escrow = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  await fanOutEscrowEvent(app, createdEvent(escrow.id))

  assert.deepStrictEqual(
    capture.enqueued.map((j) => j.name),
    ['fanout-subscribers'],
    'the republish must hand off, not expand',
  )
  assert.deepStrictEqual(capture.notifiedUserIds(), [])
  // Carrying the id and nothing else is what lets the worker re-read the gig,
  // so an edit between enqueue and expansion cannot fan out against stale
  // matching criteria.
  const [job] = capture.enqueued
  assert.strictEqual(job.name === 'fanout-subscribers' ? job.payload.escrow_id : null, escrow.id)
})

test('the expansion job is what actually reaches the subscribers', { skip }, async () => {
  // The other half of the hop: draining the job the test above stopped at must
  // produce exactly the fan-out that used to happen inline.
  const app = getApp()
  const poster = await createUser(app)
  const watcher = await createUser(app)
  await subscribe(app, watcher.row.id, '*', '*')

  const escrow = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  await fanOutEscrowEvent(app, createdEvent(escrow.id))
  assert.deepStrictEqual(capture.notifiedUserIds(), [])

  const drained = await drainSubscriberFanout(app, capture)
  assert.deepStrictEqual(drained, [{ escrow_id: escrow.id }])
  assert.deepStrictEqual(capture.notifiedUserIds(), [watcher.row.id])
})

test('re-running the expansion reuses the notification id (a retry writes no second row)', { skip }, async () => {
  // The failure mode the queue hop introduced: this job is RETRIED, so a
  // failure part-way through a large expansion replays the pages before it. The
  // id is what stops that replay giving everyone a duplicate row and a second
  // badge — `persistNotification` inserts onConflictDoNothing on it.
  const app = getApp()
  const poster = await createUser(app)
  const watcher = await createUser(app)
  await subscribe(app, watcher.row.id, '*', '*')

  const escrow = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  await created(app, escrow.id)
  await created(app, escrow.id)

  const ids = capture.notifications().map((n) => n.id)
  assert.strictEqual(ids.length, 2, 'both runs enqueued — the dedup is at the id, not the enqueue')
  assert.strictEqual(ids[0], ids[1], 'same (gig, recipient) must mean the same notification id')

  // The id is only half of it. Both jobs reach the DELIVERY worker, and until
  // #45 that worker pushed on every attempt regardless of whether the insert
  // conflicted — so the replay this test describes buzzed the subscriber twice
  // while writing one row.
  //
  // COUNT THE PUSHES. Asserting on rows and badges here would be decoration:
  // both were already idempotent before #45, and measured — with the fix
  // reverted, a version of this test that checked only those two passed clean.
  // The wire is the only thing that saw the bug.
  await app.db
    .insert(device_tokens)
    .values({ user_id: watcher.row.id, token: 'ExponentPushToken[live]', platform: 'expo' })

  const pushed = stubExpoPush()
  const deliver = buildProcessors(app).notifications
  try {
    for (const job of capture.notifications()) await deliver(job)
  } finally {
    restoreFetch()
  }

  assert.strictEqual(
    pushed.tokens.length,
    1,
    'the replayed page re-pushed — every subscriber buzzed twice',
  )

  const rows = await app.db
    .select()
    .from(notifications)
    .where(eq(notifications.user_id, watcher.row.id))
  assert.strictEqual(rows.length, 1, 'and still exactly one row')
})

test('one subscriber, two gigs: DIFFERENT ids (or they only ever hear about the first)', { skip }, async () => {
  // The other axis of the key, and the more dangerous one to get wrong. The id
  // is a primary key inserted onConflictDoNothing, so an id that varied by
  // recipient but NOT by gig would notify each subscriber about the first
  // matching gig they ever saw and then silently drop every gig after it — a
  // fan-out that looks healthy from the queue and delivers nothing.
  const app = getApp()
  const poster = await createUser(app)
  const watcher = await createUser(app)
  await subscribe(app, watcher.row.id, '*', '*')

  const first = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  const second = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  await created(app, first.id)
  await created(app, second.id)

  const ids = capture.notifications().map((n) => n.id)
  assert.strictEqual(ids.length, 2)
  assert.notStrictEqual(ids[0], ids[1], 'two gigs must not collide on one notification id')
})

test('two recipients of one gig get DIFFERENT ids', { skip }, async () => {
  // The other half: one id shared across recipients would let
  // onConflictDoNothing drop every row after the first, so the fan-out would
  // silently notify one person out of however many matched.
  const app = getApp()
  const poster = await createUser(app)
  const a = await createUser(app)
  const b = await createUser(app)
  await subscribe(app, a.row.id, '*', '*')
  await subscribe(app, b.row.id, '*', '*')

  const escrow = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  await created(app, escrow.id)

  const ids = capture.notifications().map((n) => n.id)
  assert.strictEqual(new Set(ids).size, 2)
})

// ── paging ─────────────────────────────────────────────────────────────────

test('more subscribers than a page: every one is notified, once, across batches', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)

  // PAGE_SIZE + 1, derived rather than literal: a hard-coded 501 would stop
  // testing paging the moment the page size changed, and would still pass.
  const watchers = Array.from({ length: SUBSCRIBER_PAGE_SIZE + 1 }, () => userFixture())
  // Bulk-inserted: 501 round trips would dominate this suite's runtime, and the
  // rows are fixtures, not the subject.
  await app.db.insert(users).values(watchers)
  await app.db
    .insert(gig_subscriptions)
    .values(watchers.map((w) => ({ user_id: w.id, city: '*', category: '*' })))

  const escrow = await createdGig(app, poster.row.id, { city: 'Lagos', category: 'service' })
  await created(app, escrow.id)

  const notified = capture.notifiedUserIds()
  assert.strictEqual(notified.length, SUBSCRIBER_PAGE_SIZE + 1, 'nobody dropped at the boundary')
  assert.strictEqual(new Set(notified).size, notified.length, 'nobody notified twice')
  assert.deepStrictEqual(
    new Set(notified),
    new Set(watchers.map((w) => w.id)),
    'and they are the right people',
  )
  // The point of the exercise: two round trips, not one unbounded one and not
  // 501. Flattened `enqueued` cannot see this — only the batch sizes can.
  assert.deepStrictEqual(capture.bulkBatchSizes, [SUBSCRIBER_PAGE_SIZE, 1])
})
