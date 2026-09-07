import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { parseWsServerFrame, type GigFeedServerFrame } from '@tenda/shared'
import { escrows } from '@tenda/shared/db/schema'
import { buildVerifyTxDeps } from '@server/workers/processors'
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

function capturedFeedFrames(): GigFeedServerFrame[] {
  return capture.broadcasts.flatMap(({ channel, payload }) => {
    const frame = parseWsServerFrame({ channel, ...payload })
    return frame?.type === 'gig_available' || frame?.type === 'gig_unavailable'
      ? [frame]
      : []
  })
}

test('created gig publishes its committed projection and matching revision', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  await attachGigDetails(app, escrow.id, { title: 'Realtime projection' })

  await buildVerifyTxDeps(app).republish(
    republishEvent('EscrowCreated', { escrow_id: escrow.id }),
  )

  const frames = capturedFeedFrames()
  assert.strictEqual(frames.length, 1)
  assert.strictEqual(frames[0].type, 'gig_available')
  if (frames[0].type !== 'gig_available') return
  assert.strictEqual(frames[0].gig.title, 'Realtime projection')
  assert.strictEqual(frames[0].gig.public_feed_revision, frames[0].gig_revision)

  const [stored] = await app.db
    .select({ revision: escrows.public_feed_revision })
    .from(escrows)
    .where(eq(escrows.id, escrow.id))
  assert.strictEqual(stored.revision, frames[0].gig_revision)
})

test('accepted gig publishes unavailable and increments on a repeated fan-out', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, status: 'accepted' })
  await attachGigDetails(app, escrow.id)

  const deps = buildVerifyTxDeps(app)
  await deps.republish(republishEvent('EscrowAccepted', { escrow_id: escrow.id }))
  await deps.republish(republishEvent('EscrowAccepted', { escrow_id: escrow.id }))

  const frames = capturedFeedFrames()
  assert.deepStrictEqual(frames.map((frame) => frame.type), [
    'gig_unavailable',
    'gig_unavailable',
  ])
  assert.strictEqual(BigInt(frames[1].gig_revision), BigInt(frames[0].gig_revision) + 1n)
})

test('delayed accepted fan-out announces current open state instead of stale removal', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  await attachGigDetails(app, escrow.id)

  await buildVerifyTxDeps(app).republish(
    republishEvent('EscrowAccepted', { escrow_id: escrow.id }),
  )

  const [frame] = capturedFeedFrames()
  assert.strictEqual(frame.type, 'gig_available')
})

test('exchange fan-out never leaks onto the public gig channel', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    kind: 'exchange',
    status: 'open',
  })

  await buildVerifyTxDeps(app).republish(
    republishEvent('EscrowCreated', { escrow_id: escrow.id }),
  )

  assert.deepStrictEqual(capturedFeedFrames(), [])
})

test('a direct invite is unavailable until its assignee declines', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const assignee = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    assigned_counterparty_id: assignee.row.id,
    status: 'open',
  })
  await attachGigDetails(app, escrow.id)
  const deps = buildVerifyTxDeps(app)

  await deps.republish(republishEvent('EscrowCreated', { escrow_id: escrow.id }))
  assert.strictEqual(capturedFeedFrames()[0].type, 'gig_unavailable')

  await app.db
    .update(escrows)
    .set({ assigned_counterparty_id: null })
    .where(eq(escrows.id, escrow.id))
  await deps.republish(republishEvent('EscrowDeclined', { escrow_id: escrow.id }))
  assert.strictEqual(capturedFeedFrames()[1].type, 'gig_available')
})
