/**
 * Stage 7 — the producer contract (plugins/notifications.ts). These listeners
 * decide WHAT reaches the in-app centre: chat (`message.sent`) must push but
 * NOT persist (persist:false — it has its own read surface), while review and
 * fiat notices persist (persist:true) with a deep-linkable `data` bag. Delivery
 * (persist true/false → row/no-row) is covered by worker-processors.test.ts;
 * this pins the flags + data the producers actually pass.
 *
 * Pure unit: a minimal Fastify app with stub db/queue plugins registers the
 * REAL notifications plugin, so no DB/Redis is needed — just the appEvents wiring.
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import Fastify, { type FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import notificationsPlugin from '@server/plugins/notifications'
import { appEvents } from '@server/lib/events'
import type { AppDatabase } from '@server/plugins/db'
import type { JobPayload } from '@server/plugins/queue'
import { queueDouble, type QueueDouble } from '../helpers/queue-double'

let app: FastifyInstance
let queue: QueueDouble

/**
 * The notification jobs this test's listeners produced.
 *
 * Read through the shared double rather than a hand-rolled stub that pushed
 * `payload as NotifJob`: that cast asserted the very correlation between queue
 * name and payload shape the double derives, so a listener enqueuing onto the
 * wrong queue would have been recorded here as a notification.
 */
const notifs = (): JobPayload['notifications'][] => queue.notifications()

before(async () => {
  app = Fastify({ logger: false })
  // Stub the two decorators the plugin declares as dependencies. The plugin
  // never touches the db in these paths, so an empty object stands in.
  await app.register(
    fp(
      async (f) => {
        f.decorate('db', {} as AppDatabase)
      },
      { name: 'db' },
    ),
  )
  await app.register(
    fp(
      async (f) => {
        queue = queueDouble()
        f.decorate('queue', queue)
      },
      { name: 'queue' },
    ),
  )
  await app.register(notificationsPlugin)
  await app.ready()
})

after(async () => {
  await app.close()
})

beforeEach(() => {
  // Both recorders, via the double's own reset — clearing `calls` by hand here
  // would leave `bulkBatchSizes` accumulating across every test in the file.
  queue.reset()
})

/** Listeners are async; emit is sync — let the microtasks settle. */
const flush = () => new Promise((r) => setImmediate(r))

test('message.sent pushes but does NOT persist (chat stays out of the centre)', async () => {
  appEvents.emit('message.sent', {
    recipientId: 'u-recipient',
    senderId: 'u-sender',
    conversationId: 'c1',
    preview: 'hey there',
  })
  await flush()

  assert.strictEqual(notifs().length, 1)
  assert.strictEqual(notifs()[0].user_id, 'u-recipient')
  assert.strictEqual(notifs()[0].persist, false)
  assert.deepStrictEqual(notifs()[0].data, { screen: 'chat', conversationId: 'c1', userId: 'u-sender' })
})

test('review.submitted persists and deep-links a gig (title set → kind gig)', async () => {
  appEvents.emit('review.submitted', {
    revieweeId: 'u-reviewee',
    reviewerId: 'u-reviewer',
    escrowId: 'e1',
    title: 'Build a logo',
    score: 5,
  })
  await flush()

  assert.strictEqual(notifs().length, 1)
  assert.strictEqual(notifs()[0].user_id, 'u-reviewee')
  assert.strictEqual(notifs()[0].persist, true)
  assert.deepStrictEqual(notifs()[0].data, { screen: 'escrow', escrowId: 'e1', kind: 'gig' })
})

test('review.submitted on an exchange (null title) deep-links kind exchange', async () => {
  appEvents.emit('review.submitted', {
    revieweeId: 'u-reviewee',
    reviewerId: 'u-reviewer',
    escrowId: 'e2',
    title: null,
    score: 4,
  })
  await flush()

  assert.strictEqual(notifs().length, 1)
  assert.strictEqual(notifs()[0].data?.kind, 'exchange')
})

test('fiat.settled persists and deep-links the intent', async () => {
  appEvents.emit('fiat.settled', {
    user_id: 'u-fiat',
    intent_id: 'i1',
    direction: 'offramp',
    fiat_currency: 'NGN',
    fiat_amount: '15000.00',
    asset: 'USDC_SOL',
    asset_amount_raw: '10000000',
  })
  await flush()

  assert.strictEqual(notifs().length, 1)
  assert.strictEqual(notifs()[0].user_id, 'u-fiat')
  assert.strictEqual(notifs()[0].persist, true)
  assert.deepStrictEqual(notifs()[0].data, { screen: 'fiat-intent', intentId: 'i1' })
})

test('fiat.failed persists the failure reason for the intent', async () => {
  appEvents.emit('fiat.failed', {
    user_id: 'u-fiat',
    intent_id: 'i2',
    direction: 'onramp',
    fiat_currency: 'KES',
    fiat_amount: '1300.00',
    asset: 'USDC_SOL',
    asset_amount_raw: '10000000',
    reason: 'Card declined',
  })
  await flush()

  assert.strictEqual(notifs().length, 1)
  assert.strictEqual(notifs()[0].persist, true)
  assert.strictEqual(notifs()[0].body, 'Card declined')
  assert.deepStrictEqual(notifs()[0].data, { screen: 'fiat-intent', intentId: 'i2' })
})

// Approval mode has no other poster-facing signal: an application writes a row
// and sends no transaction, so an unwired listener leaves the shortlist a
// screen the poster never learns to open.
test('gig.application_received: notifies the poster and names the gig', async () => {
  appEvents.emit('gig.application_received', {
    escrow_id: 'escrow-9',
    creator_id: 'creator-9',
    applicant_id: 'worker-9',
    title: 'Deliver a parcel',
  })
  await flush()

  assert.strictEqual(notifs().length, 1, 'exactly one notice')
  const [job] = notifs()
  assert.strictEqual(job.user_id, 'creator-9', 'the poster, never the applicant who acted')
  assert.match(job.title, /applicant/i)
  // A poster can have several gigs taking applications at once, so the notice
  // has to say WHICH one.
  assert.match(job.body, /Deliver a parcel/)
  assert.deepStrictEqual(job.data, { screen: 'escrow', escrowId: 'escrow-9', kind: 'gig' })
  assert.strictEqual(job.persist, true, 'it belongs in the notification centre')
})

// The whole point of the off-chain `/release` is that the POSTER finds out —
// the escrow does not move, so nothing else tells them the gig needs their
// attention. An unwired listener would make the feature silently do nothing.
test('assignment_released_offchain: notifies the poster, deep-linked to the gig', async () => {
  appEvents.emit('escrow.assignment_released_offchain', {
    escrow_id: 'escrow-1',
    creator_id: 'creator-1',
    worker_id: 'worker-1',
  })
  await flush()

  assert.strictEqual(notifs().length, 1, 'exactly one notice')
  const [job] = notifs()
  assert.strictEqual(job.user_id, 'creator-1', 'the poster, not the worker who acted')
  assert.match(job.title, /stepped back/i)
  // It must tell them what to DO — the escrow is still theirs to unassign.
  assert.match(job.body, /release the assignment/i)
  assert.deepStrictEqual(job.data, { screen: 'escrow', escrowId: 'escrow-1', kind: 'gig' })
  assert.strictEqual(job.persist, true, 'it belongs in the notification centre')
})
