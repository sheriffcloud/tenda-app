/**
 * WHO a dispute reply notifies (#124).
 *
 * `escrows/_id/dispute/messages/index.ts:170` builds the recipient list —
 * creator, counterparty, assigned counterparty, mediator — and then does three
 * things to it on one line:
 *
 *   .filter(u => u !== null && u !== request.user.id)   drop absent, drop SENDER
 *   new Set(recipients)                                 dedupe
 *
 * NONE OF IT WAS ASSERTED. Measured while closing #123: removing
 * `&& u !== request.user.id`, so a party is push-notified about their own reply,
 * left dispute-thread and dispute-claims green across 31 tests.
 *
 * WHAT THAT COSTS is not data but trust: "The other party replied in your
 * dispute" arriving for a message you just sent, on the one surface where a user
 * is already anxious and reading every notification closely.
 *
 * WHY IT NEEDS ITS OWN SUITE rather than an extra assertion in #123's: that one
 * is about a two-party WS mirror, this is a multi-party queue fan-out, and the
 * observable is a notification job rather than a broadcast frame. Same helper,
 * different seam.
 *
 * The route deliberately enqueues with `persist: false` — the dispute thread has
 * its own read surface — so these notices exist only as jobs, which is the other
 * reason the capture is the only place to see them.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import { installCapture, type SideEffectCapture } from '../helpers/side-effects'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader } from '../helpers/test-app'
import { disputedEscrow } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()
let capture: SideEffectCapture

beforeEach(() => {
  if (!skip) capture = installCapture(getApp())
})

/** A claimed dispute: both parties, plus the mediator holding the claim. */
async function claimedDispute(): Promise<{
  escrowId: string
  creatorId: string
  workerId: string
  mediatorId: string
  tokens: { creator: string; worker: string; mediator: string }
}> {
  const app = getApp()
  const { creator, worker, escrow, dispute_id } = await disputedEscrow(app)
  const mediator = await createUser(app, { role: 'dispute_admin' })
  const claimed = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(claimed.statusCode, 200, claimed.body)
  return {
    escrowId: escrow.id,
    creatorId: creator.row.id,
    workerId: worker.row.id,
    mediatorId: mediator.row.id,
    tokens: { creator: creator.token, worker: worker.token, mediator: mediator.token },
  }
}

/** Post a reply and return who it notified, sorted so order is not the subject. */
async function notifiedBy(escrowId: string, token: string, body: string): Promise<string[]> {
  const app = getApp()
  capture.enqueued.length = 0
  const res = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${escrowId}/dispute/messages`,
    headers: authHeader(token),
    payload: { body },
  })
  assert.strictEqual(res.statusCode, 201, res.body)
  return capture.notifiedUserIds().sort()
}

test('a dispute reply notifies every OTHER participant, and never the sender', { skip }, async () => {
  // All three directions, because the sender-exclusion is one line serving all
  // of them and each leaves a different member out of the list. A party's reply
  // must reach the other party AND the mediator; the mediator's must reach both
  // parties.
  const { escrowId, creatorId, workerId, mediatorId, tokens } = await claimedDispute()

  assert.deepStrictEqual(
    await notifiedBy(escrowId, tokens.creator, 'The work was never delivered.'),
    [workerId, mediatorId].sort(),
    "the creator's reply reaches the worker and the mediator, not the creator",
  )
  assert.deepStrictEqual(
    await notifiedBy(escrowId, tokens.worker, 'It was delivered on the agreed date.'),
    [creatorId, mediatorId].sort(),
    "the worker's reply reaches the creator and the mediator, not the worker",
  )
  assert.deepStrictEqual(
    await notifiedBy(escrowId, tokens.mediator, 'Reviewing the evidence from both sides.'),
    [creatorId, workerId].sort(),
    "the mediator's reply reaches both parties, not the mediator",
  )
})

test('a participant listed twice is notified ONCE', { skip }, async () => {
  // `new Set(recipients)` is the other thing that line does, and it matters in a
  // real state: on an assigned gig the counterparty and the assigned
  // counterparty are the same person, so the raw list names them twice. Without
  // the dedupe they get two identical pushes for one message.
  const app = getApp()
  const { escrowId, workerId, mediatorId, tokens } = await claimedDispute()
  await app.db
    .update(escrows)
    .set({ assigned_counterparty_id: workerId })
    .where(eq(escrows.id, escrowId))

  const notified = await notifiedBy(escrowId, tokens.creator, 'Raising this with the mediator.')
  assert.deepStrictEqual(
    notified,
    [workerId, mediatorId].sort(),
    'the worker appears once despite being both counterparty and assigned counterparty',
  )
})
