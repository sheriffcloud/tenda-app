import { beforeEach, test } from 'node:test'
import assert from 'node:assert'
import { gig_subscriptions } from '@tenda/shared/db/schema'
import { buildProcessors, buildVerifyTxDeps } from '@server/workers/processors'
import { channelName } from '@server/lib/ws'
import { installCapture, type SideEffectCapture } from '../helpers/side-effects'
import { republishEvent } from '../helpers/republish-event'
import {
  TEST_DB_CONFIGURED,
  attachGigDetails,
  createEscrow,
  createUser,
  useTestApp,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
let capture: SideEffectCapture

beforeEach(() => {
  if (!skip) capture = installCapture(getApp())
})

function escrowFrames(escrowId: string) {
  const channel = channelName({ kind: 'escrow', id: escrowId })
  return capture.broadcasts.filter((broadcast) => broadcast.channel === channel)
}

test('republish broadcasts the exact escrow event on the private channel', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id })
  await buildVerifyTxDeps(app).republish(
    republishEvent('EscrowAccepted', { escrow_id: escrow.id, tx_ref: 'sig-abc' }),
  )
  const frames = escrowFrames(escrow.id)
  assert.strictEqual(frames.length, 1)
  assert.deepStrictEqual(frames[0].payload, {
    type: 'escrow_event', escrow_id: escrow.id, event: 'EscrowAccepted', tx_ref: 'sig-abc',
  })
})

test('accepted notifies the creator only', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
  })
  await buildVerifyTxDeps(app).republish(republishEvent('EscrowAccepted', { escrow_id: escrow.id }))
  assert.deepStrictEqual(capture.notifiedUserIds(), [creator.row.id])
  assert.strictEqual(capture.notifications()[0].title, 'Gig accepted')
  assert.deepStrictEqual(capture.notifications()[0].data, {
    screen: 'escrow', escrowId: escrow.id, kind: 'gig',
  })
  assert.strictEqual(typeof capture.notifications()[0].id, 'string')
  assert.strictEqual(capture.notifications()[0].persist, true)
})

test('approved notifies the counterparty only', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
  })
  await buildVerifyTxDeps(app).republish(republishEvent('EscrowApproved', { escrow_id: escrow.id }))
  assert.deepStrictEqual(capture.notifiedUserIds(), [worker.row.id])
})

test('counterparty assignment notifies the worker, not the poster', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
  })
  await buildVerifyTxDeps(app).republish(
    republishEvent('CounterpartyAssigned', { escrow_id: escrow.id }),
  )
  assert.deepStrictEqual(capture.notifiedUserIds(), [worker.row.id])
  assert.strictEqual(capture.notifications()[0].title, 'You got the gig')
})

test('assignment release reaches the worker removed from the row', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, counterparty_id: null })
  await buildVerifyTxDeps(app).republish(republishEvent('AssignmentReleased', {
    escrow_id: escrow.id,
    counterparty_id: worker.row.id,
  }))
  assert.deepStrictEqual(capture.notifiedUserIds(), [worker.row.id])
  assert.strictEqual(capture.notifications()[0].title, 'Assignment withdrawn')
})

test('assignment release without a carried worker notifies nobody', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, counterparty_id: null })
  await buildVerifyTxDeps(app).republish(
    republishEvent('AssignmentReleased', { escrow_id: escrow.id }),
  )
  assert.deepStrictEqual(capture.notifiedUserIds(), [])
})

test('dispute raised notifies both parties', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
  })
  await buildVerifyTxDeps(app).republish(republishEvent('DisputeRaised', { escrow_id: escrow.id }))
  assert.deepStrictEqual(
    new Set(capture.notifiedUserIds()),
    new Set([creator.row.id, worker.row.id]),
  )
})

test('a two-party event with no counterparty notifies only the creator', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, counterparty_id: null })
  await buildVerifyTxDeps(app).republish(republishEvent('DisputeResolved', { escrow_id: escrow.id }))
  assert.deepStrictEqual(capture.notifiedUserIds(), [creator.row.id])
})

test('cancelled broadcasts privately but enqueues no notice', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id })
  await buildVerifyTxDeps(app).republish(republishEvent('EscrowCancelled', { escrow_id: escrow.id }))
  assert.strictEqual(escrowFrames(escrow.id).length, 1)
  assert.strictEqual(capture.enqueued.length, 0)
})

test('a notice event for a missing escrow only broadcasts privately', { skip }, async () => {
  const app = getApp()
  const missing = '00000000-0000-4000-8000-000000000000'
  await buildVerifyTxDeps(app).republish(republishEvent('EscrowAccepted', { escrow_id: missing }))
  assert.strictEqual(escrowFrames(missing).length, 1)
  assert.strictEqual(capture.enqueued.length, 0)
})

test('created broadcasts and hands subscriber expansion to its queue', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const subscriber = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, kind: 'gig' })
  await attachGigDetails(app, escrow.id, { city: 'Lagos', category: 'service' })
  await app.db.insert(gig_subscriptions).values({
    user_id: subscriber.row.id,
    city: 'Lagos',
    category: 'service',
  })
  await buildVerifyTxDeps(app).republish(republishEvent('EscrowCreated', { escrow_id: escrow.id }))
  assert.strictEqual(escrowFrames(escrow.id).length, 1)
  assert.deepStrictEqual(capture.enqueued.map((job) => job.name), ['fanout-subscribers'])
  assert.deepStrictEqual(capture.notifiedUserIds(), [])
})

test('subscriber expansion for a missing escrow is a no-op', { skip }, async () => {
  await buildProcessors(getApp())['fanout-subscribers']({
    escrow_id: '00000000-0000-4000-8000-000000000000',
  })
  assert.strictEqual(capture.enqueued.length, 0)
})
