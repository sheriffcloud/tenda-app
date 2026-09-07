/**
 * features/alerts/channels/in-app — `deliver()`: who gets a bell row, and what
 * job is written for each.
 *
 * An integration test because every claim is about ROWS — which admins the
 * permission-derived roster returns, whether a party-admin is left out, and
 * whether a suspended one is. A fake store would assert the query I wrote
 * rather than the one postgres runs. The wording is pinned without a database
 * in test/unit/alerts-in-app-copy.test.ts.
 *
 * The queue is a double: this channel's job is to PRODUCE notification jobs,
 * and what the delivery worker then does with them is lib/notify's contract,
 * covered by its own tests.
 *
 * Gated on TEST_DATABASE_URL.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { displayName, NOTIFICATION_SCREEN, type AdminRole } from '@tenda/shared'
import { alertIdentity } from '@server/features/alerts'
import type { AlertDeps, AlertOf } from '@server/features/alerts'
import { inAppAlertChannel } from '@server/features/alerts/channels/in-app'
import { stableNotificationId } from '@server/lib/notify'
import { TEST_DB_CONFIGURED, useTestApp, createUser } from '../helpers/test-app'
import { queueDouble, type QueueDouble } from '../helpers/queue-double'
import { alertLogSpy, type AlertLogSpy } from '../helpers/alert-log'
import { disputeRaisedAlert } from '../helpers/alert-fixtures'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

let queue: QueueDouble
let log: AlertLogSpy

beforeEach(() => {
  if (skip) return
  queue = queueDouble()
  log = alertLogSpy()
})

function deps(): AlertDeps {
  return { db: getApp().db, queue, log, env: {} }
}

/** A user created AS `role`, in one insert — see alerts-recipients for why. */
async function admin(role: AdminRole, opts: { suspended?: boolean } = {}) {
  return createUser(getApp(), {
    role,
    ...(opts.suspended === true ? { status: 'suspended' as const } : {}),
  })
}

/** The notification jobs this channel produced, in order. */
function notified() {
  return queue.notifications()
}

function recipients(): string[] {
  return notified().map((job) => job.user_id)
}

async function deliver(over: Partial<AlertOf<'dispute.raised'>> = {}): Promise<void> {
  await inAppAlertChannel.deliver(disputeRaisedAlert(over), deps())
}

// ---------- who gets a row -------------------------------------------------

test('every active mediator gets one notification', { skip }, async () => {
  const a = await admin('dispute_admin')
  const b = await admin('super_admin')

  await deliver()

  assert.deepStrictEqual(recipients().sort(), [a.row.id, b.row.id].sort())
})

test('an ordinary user is not a mediator', { skip }, async () => {
  await createUser(getApp())
  await deliver()
  assert.deepStrictEqual(recipients(), [])
})

// Suspended admins are locked out at authentication, so they cannot open the
// dispute they would be paged about — and an inflated roster looks like someone
// is watching when nobody is.
test('a suspended admin is not paged', { skip }, async () => {
  const active = await admin('dispute_admin')
  await admin('dispute_admin', { suspended: true })

  await deliver()

  assert.deepStrictEqual(recipients(), [active.row.id])
})

// THE conflict rule: an admin who is a party to the disputed escrow already
// gets the party notice, and assertCanClaimDispute bars them from claiming it.
test('an admin who is a PARTY to the escrow is not paged as a mediator', { skip }, async () => {
  const partyAdmin = await admin('dispute_admin')
  const neutral = await admin('dispute_admin')

  await deliver({ creator_id: partyAdmin.row.id })

  assert.deepStrictEqual(recipients(), [neutral.row.id])
})

test('a counterparty admin is excluded too, not just the creator', { skip }, async () => {
  const partyAdmin = await admin('super_admin')
  const neutral = await admin('dispute_admin')

  await deliver({ counterparty_id: partyAdmin.row.id })

  assert.deepStrictEqual(recipients(), [neutral.row.id])
})

// Every mediator is conflicted: nobody to tell. Must not throw — the Slack job
// is a separate job and must still succeed.
test('an empty roster produces no jobs and no throw', { skip }, async () => {
  const partyAdmin = await admin('dispute_admin')

  await deliver({ creator_id: partyAdmin.row.id })

  assert.deepStrictEqual(notified(), [])
  // mediatorUserIds already warned, with the counts that distinguish "no
  // admins" from "every admin is a party".
  assert.ok(log.warns.length > 0, 'the silence must be recorded somewhere')
})

// ---------- what each row says ---------------------------------------------

test('the notification names the raiser, resolved from the DATABASE', { skip }, async () => {
  await admin('dispute_admin')
  const raiser = await createUser(getApp(), { first_name: 'Grace', last_name: 'Hopper' })

  await deliver({ raised_by_id: raiser.row.id, escrow_title: 'Deliver 500 flyers' })

  const [job] = notified()
  assert.ok(job.body.includes('Grace Hopper'), job.body)
  assert.ok(job.body.includes('Deliver 500 flyers'), job.body)
})

test('a raiser whose row is gone still yields a searchable label', { skip }, async () => {
  await admin('dispute_admin')
  const gone = randomUUID()

  await deliver({ raised_by_id: gone })

  assert.ok(notified()[0].body.includes(displayName(null, null, gone)))
})

test('every row persists and deep-links to the dispute', { skip }, async () => {
  await admin('dispute_admin')
  const alert = disputeRaisedAlert()

  await inAppAlertChannel.deliver(alert, deps())

  const [job] = notified()
  assert.strictEqual(job.persist, true, 'an alert with no bell row is not an alert')
  assert.strictEqual(job.data?.screen, NOTIFICATION_SCREEN.dispute)
  assert.strictEqual(job.data?.escrowId, alert.escrow_id)
})

// ---------- idempotency ----------------------------------------------------

// notifications.id is the PRIMARY KEY, so one id shared across the roster would
// let persistNotification's onConflictDoNothing drop every row after the first
// — the fan-out would silently notify exactly one admin.
test('each recipient gets a DISTINCT notification id', { skip }, async () => {
  await admin('dispute_admin')
  await admin('super_admin')

  await deliver()

  const ids = notified().map((job) => job.id)
  assert.strictEqual(ids.length, 2)
  assert.strictEqual(new Set(ids).size, 2, 'a shared id would notify only one admin')
})

// A redelivered alert job (a worker that died before acking) must not write a
// second bell row for the same dispute.
test('redelivering the same alert re-derives the same ids', { skip }, async () => {
  await admin('dispute_admin')
  const alert = disputeRaisedAlert()

  await inAppAlertChannel.deliver(alert, deps())
  const first = notified().map((job) => job.id)

  queue = queueDouble()
  await inAppAlertChannel.deliver(alert, deps())

  assert.deepStrictEqual(notified().map((job) => job.id), first)
})

// Seeded from `alertIdentity` so the bell's dedup key and the queue's cannot
// drift apart — asserted against the real derivation, not a copy of it.
test('the id is derived from the alert identity and the recipient', { skip }, async () => {
  const mediator = await admin('dispute_admin')
  const alert = disputeRaisedAlert()

  await inAppAlertChannel.deliver(alert, deps())

  assert.strictEqual(
    notified()[0].id,
    stableNotificationId('alert', alertIdentity(alert), mediator.row.id),
  )
})

// Two disputes on the same escrow (raise, resolve, raise again) are two events
// and must both be seen.
test('a different transaction yields different ids', { skip }, async () => {
  await admin('dispute_admin')
  const escrow_id = randomUUID()

  await inAppAlertChannel.deliver(disputeRaisedAlert({ escrow_id, tx_ref: 'sig-one' }), deps())
  const first = notified()[0].id

  queue = queueDouble()
  await inAppAlertChannel.deliver(disputeRaisedAlert({ escrow_id, tx_ref: 'sig-two' }), deps())

  assert.notStrictEqual(notified()[0].id, first)
})

// ---------- logging --------------------------------------------------------

test('one line records that the channel ran, with the recipient count', { skip }, async () => {
  await admin('dispute_admin')
  await admin('super_admin')

  await deliver()

  assert.strictEqual(log.infos.length, 1)
  assert.strictEqual(log.infos[0].obj.channel, inAppAlertChannel.name)
  assert.strictEqual(log.infos[0].obj.recipients, 2)
})
