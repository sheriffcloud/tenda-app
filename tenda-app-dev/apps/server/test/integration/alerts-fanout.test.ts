/**
 * workers/escrow-fanout — the alert hook (step 2), and only that.
 *
 * Everything either side of this seam is already covered: which events raise an
 * alert, the job id and the producer's failure posture live in
 * test/unit/alerts-enqueue.test.ts, and the WS frame and party notices in
 * test/integration/worker-processors.test.ts. What NO other suite can see is
 * whether the fan-out calls the producer at all, WHERE, and with what — the
 * pipeline was inert until this hook existed, and every test upstream of it
 * passed the whole time.
 *
 * So the properties here are the ones whose failure mode is silence:
 *
 *  1. a dispute event reaches the alerts queue, carrying the ids the REAL event
 *     had rather than a fixture the hook invented;
 *  2. the hook is SELECTIVE — an ordinary transition enqueues no alert, while
 *     still notifying the parties, so "nothing was alerted" cannot be confused
 *     with "nothing ran";
 *  3. the hook sits ABOVE the early returns further down, which is the one
 *     placement decision that is invisible in review and silent in production;
 *  4. neither audience can cost the other its delivery;
 *  5. the fan-out does not report done while the alert is still in flight —
 *     the dropped-`await` slip, which no lint rule here would catch.
 *
 * Reached through `buildVerifyTxDeps(app).republish(...)` — the real seam
 * verify-tx calls — so nothing in the source is exported for the test.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { buildVerifyTxDeps } from '@server/workers/processors'
import { channelsFor } from '@server/features/alerts'
import type { AlertChannel } from '@server/features/alerts'
import { channelName } from '@server/lib/ws'
import { installCapture, interceptQueue, type SideEffectCapture } from '../helpers/side-effects'
import { republishEvent } from '../helpers/republish-event'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

let cap: SideEffectCapture
beforeEach(() => {
  if (skip) return
  cap = installCapture(getApp())
})

/**
 * The channels a dispute alert should actually reach in THIS environment.
 *
 * Derived from the registry rather than written down, because it depends on
 * what the harness has configured: Slack opts out without a webhook, the bell
 * never does. A hardcoded `['in_app']` would pass here and fail on a machine
 * with SLACK_WEBHOOK_DISPUTES exported — and, worse, would keep passing if a
 * third channel were registered and never enqueued.
 *
 * Asserts non-empty ITSELF rather than leaving each caller to remember: every
 * count assertion in this file is against this list, so on a deployment with no
 * configured channel at all they would each read `0 === 0` and pass while
 * nothing was alerted. That is the exact silence the feature exists to prevent,
 * and it is not something one test should guard on behalf of the others.
 */
function expectedChannels(): AlertChannel[] {
  const configured = channelsFor('dispute.raised').filter((channel) => channel.configured())
  assert.ok(configured.length > 0, 'no configured channel — every assertion here would be vacuous')
  return configured
}

/**
 * An escrow with both parties present. Returns only its id, deliberately.
 *
 * The parties have to EXIST — without a counterparty the party fan-out reaches
 * one person and the "it still ran" assertions would be measuring something
 * else — but no test here names them. Which party an event reaches is
 * worker-processors.test.ts's subject, so handing their ids back would only
 * invite this file to grow a copy of assertions it does not own.
 *
 * `disputed` because that is the honest state for the dispute cases; the
 * fan-out itself reads only `creator_id`, `counterparty_id` and `kind`, so it
 * is immaterial to the one test here that republishes a different event.
 */
async function escrowWithParties(): Promise<string> {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'disputed',
  })
  return escrow.id
}

// ---------- 1. the hook fires, with the real event ----------------------------

test('a dispute republish enqueues one alert job per configured channel', { skip }, async () => {
  const escrow_id = await escrowWithParties()
  const event = republishEvent('DisputeRaised', { escrow_id })
  const expected = expectedChannels()

  await buildVerifyTxDeps(getApp()).republish(event)

  assert.deepStrictEqual(
    cap.alerts().map((job) => job.payload.channel),
    expected.map((channel) => channel.name),
  )
})

// The bell is the channel with no optional dependency, so it is the one that
// must be reached in EVERY deployment. Asserted separately from the derived
// list above, which would still agree with itself if the registry lost it.
test('the in-app channel is reached regardless of what else is configured', { skip }, async () => {
  const escrow_id = await escrowWithParties()
  await buildVerifyTxDeps(getApp()).republish(republishEvent('DisputeRaised', { escrow_id }))

  assert.ok(
    cap.alerts().some((job) => job.payload.channel === 'in_app'),
    'a deployment with no Slack must still alert someone',
  )
})

// The hook's own contribution, as distinct from the mapper it calls: that it
// hands over the event it was given. A hook that built its own ref — or passed
// a stale one captured elsewhere — would enqueue jobs that resolve to nothing.
test('the queued ref carries the ids of the event that actually arrived', { skip }, async () => {
  const escrow_id = await escrowWithParties()
  const event = republishEvent('DisputeRaised', { escrow_id })

  await buildVerifyTxDeps(getApp()).republish(event)

  for (const job of cap.alerts()) {
    assert.deepStrictEqual(job.payload.ref, {
      kind: 'dispute.raised',
      escrow_id: event.escrow_id,
      tx_ref: event.tx_ref,
    })
  }
})

// ---------- 2. the hook is selective ------------------------------------------

test('an ordinary transition enqueues NO alert, but still notifies the party', { skip }, async () => {
  const escrow_id = await escrowWithParties()

  await buildVerifyTxDeps(getApp()).republish(republishEvent('EscrowAccepted', { escrow_id }))

  assert.deepStrictEqual(cap.alerts(), [], 'accepted is normal progress, not an incident')
  // The positive half. Without it, deleting the hook entirely would also pass:
  // this proves the fan-out ran and chose not to alert, rather than not running.
  // Again "it ran", not WHO it reached — 'accepted notifies the creator only'
  // is worker-processors.test.ts's test, and this file must not own a copy.
  assert.ok(cap.notifiedUserIds().length > 0)
})

// ---------- 3. the hook sits above the early returns --------------------------

// THE placement regression. Step 5 returns when the escrow row is gone — an
// escrow deleted between the chain event and this job — and a hook placed after
// it would drop the alert for exactly the disputes that most need a human. The
// alert is enqueued anyway and `deliverAlert` drops it if the subject really has
// vanished, which is the layer that decision belongs to.
test('a dispute on a vanished escrow still enqueues the alert', { skip }, async () => {
  const event = republishEvent('DisputeRaised', { escrow_id: randomUUID() })

  await buildVerifyTxDeps(getApp()).republish(event)

  assert.strictEqual(cap.alerts().length, expectedChannels().length)
  assert.deepStrictEqual(cap.notifiedUserIds(), [], 'no row, so no party notice — as designed')
})

// The weaker, cheaper form of the same property: even on the happy path the
// alert must be queued before the party notices, so it cannot be lost to
// anything that goes wrong further down.
test('the alert is enqueued before the party notices', { skip }, async () => {
  const escrow_id = await escrowWithParties()

  await buildVerifyTxDeps(getApp()).republish(republishEvent('DisputeRaised', { escrow_id }))

  const names = cap.enqueued.map((job) => job.name)
  assert.ok(names.includes('alerts') && names.includes('notifications'), names.join(','))
  assert.ok(
    names.lastIndexOf('alerts') < names.indexOf('notifications'),
    `alerts must precede notifications: ${names.join(',')}`,
  )
})

// ---------- 4. neither audience costs the other -------------------------------

test('the parties are notified as well as the mediators, not instead of them', { skip }, async () => {
  const escrow_id = await escrowWithParties()

  await buildVerifyTxDeps(getApp()).republish(republishEvent('DisputeRaised', { escrow_id }))

  assert.ok(cap.alerts().length > 0, 'the mediators')
  // Deliberately "the party fan-out still ran", not WHICH parties it chose.
  // Routing is worker-processors.test.ts's subject ('dispute_raised notifies
  // BOTH parties') and the hook cannot influence it — asserting the exact set
  // here would restate that test and give it a second place to be updated.
  assert.ok(cap.notifiedUserIds().length > 0, 'the parties')
  // Step 1 is untouched by the hook above it — the TransactionMonitor still
  // gets its frame.
  assert.deepStrictEqual(
    cap.broadcasts.map((b) => b.channel),
    [channelName({ kind: 'escrow', id: escrow_id })],
  )
})

/**
 * A queue whose alert enqueue RESOLVES LATE, the way a real one does.
 *
 * The shared double records synchronously, which is convenient and slightly
 * untrue: `queue.enqueue` is a round trip to Redis. Every other assertion in
 * this file passes with the hook's `await` dropped, because a synchronous
 * double has already recorded by the time anything looks (measured — that
 * mutation was the one survivor of the harness). This makes the difference
 * observable, by being closer to the real thing rather than further from it.
 *
 * The delay is comfortably longer than the fan-out work that follows the hook —
 * one primary-key lookup and two no-op enqueues — so an unawaited hook lets
 * `republish` resolve first and the job is missing when the test looks.
 *
 * The one timing assumption, and which way it fails: CORRECT code waits for
 * this delay and then proceeds, so the assertion holds regardless of how slow
 * the machine is — there is no false failure to flake on. The assumption only
 * bounds how strong the check is against the MUTANT: on a machine where the
 * post-hook query somehow exceeded the delay, an unawaited hook would slip
 * through. Deterministically gating instead is not possible — awaiting means
 * nothing after the hook runs, so there is no later event to synchronise on.
 */
const LATE_ENQUEUE_MS = 50

const slowAlertsQueue = (): SideEffectCapture =>
  interceptQueue(getApp(), 'alerts', () => new Promise((r) => setTimeout(r, LATE_ENQUEUE_MS)))

// A dropped `await` here is invisible: `enqueueAlert` never rejects, so there is
// no unhandled rejection to trip over, and the jobs still land — just after the
// worker has reported the job done, where a shutdown or a crash between the two
// loses them. The lint rule that would catch it (no-floating-promises) needs
// type-aware linting, which this package's eslint config does not yet enable, so
// this is the only thing standing between that slip and production.
test('the fan-out does not finish until the alert is actually queued', { skip }, async () => {
  const escrow_id = await escrowWithParties()
  cap = slowAlertsQueue()

  await buildVerifyTxDeps(getApp()).republish(republishEvent('DisputeRaised', { escrow_id }))

  assert.strictEqual(
    cap.alerts().length,
    expectedChannels().length,
    'republish resolved before the alert reached the queue — the hook was not awaited',
  )
})

/** The no-Redis case, applied to the alerts queue alone. */
const failAlertsQueue = (): SideEffectCapture =>
  interceptQueue(getApp(), 'alerts', () => Promise.reject(new Error('redis gone')))

// G5 at the seam that depends on it. `enqueueAlert` promises never to throw,
// and the fan-out takes that promise seriously enough to hook the alert BEFORE
// the party notices — so if the promise were ever broken, the parties would
// silently lose their notification to an operator-alert failure. The unit suite
// proves the producer swallows; this proves the fan-out is right to rely on it.
test('an alerts-queue failure costs the parties nothing', { skip }, async () => {
  const escrow_id = await escrowWithParties()
  cap = failAlertsQueue()

  await assert.doesNotReject(() =>
    buildVerifyTxDeps(getApp()).republish(republishEvent('DisputeRaised', { escrow_id })),
  )

  assert.deepStrictEqual(cap.alerts(), [], 'the alert did not land')
  // "Still ran", not the exact party set — the same split as the test above,
  // and for the same reason. It is also all this CAN distinguish: the party
  // notices leave in one `enqueueEscrowNotice` call carrying both recipients,
  // so a truncated fan-out shows up as zero, never as one of two.
  assert.ok(cap.notifiedUserIds().length > 0, 'the parties were notified anyway')
})

/** The mirror: fail the notifications queue instead, leaving alerts working. */
const failNotificationsQueue = (): SideEffectCapture =>
  interceptQueue(getApp(), 'notifications', () => Promise.reject(new Error('redis gone')))

// The other direction of the ordering the step-2 comment claims, and the only
// test that exercises it: the alert is hooked BEFORE the party notices, so a
// notification-queue failure must not be able to take the alert with it. The
// test above holds even if the two swapped places — the alert failing first
// leaves the notices untouched either way — so it cannot see the order at all.
//
// It is also the only test that drives `interceptQueue` through `enqueueMany`.
// Party notices go out as a batch, so wrapping only `enqueue` would leave this
// hook unreached: the fan-out would succeed, `assert.rejects` would fail, and
// the gap would announce itself rather than hide.
test('a notifications-queue failure does not lose the alert — it is queued first', { skip }, async () => {
  const escrow_id = await escrowWithParties()
  cap = failNotificationsQueue()

  // Unlike the alerts queue (G5: `enqueueAlert` swallows), a party-notice
  // failure propagates — the fan-out has no catch around it and BullMQ retrying
  // the whole job is the intended recovery.
  await assert.rejects(
    () => buildVerifyTxDeps(getApp()).republish(republishEvent('DisputeRaised', { escrow_id })),
    /redis gone/,
  )

  assert.strictEqual(
    cap.alerts().length,
    expectedChannels().length,
    'the alert was lost to a failure on a different queue',
  )
  assert.deepStrictEqual(cap.notifiedUserIds(), [], 'the notices were the half that failed')
})
