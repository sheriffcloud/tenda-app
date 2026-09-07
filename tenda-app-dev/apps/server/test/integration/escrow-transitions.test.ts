/**
 * #98 gap-fill — escrow state-transition routes (build-unsigned-tx happy
 * paths + caller/status guards), exercising lib/escrow-routes + lib/escrow:
 *   accept / decline / submit / approve / cancel / refund
 *
 * `accept` is kind-agnostic (gig vs exchange/p2p-order share the same
 * transition code), so the public-accept coverage includes one exchange
 * case alongside the gig cases to pin that down.
 *
 * The harness uses a fake chain registry, so buildTx returns FAKE_UNSIGNED
 * (no RPC). Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ErrorCode, type ProofType } from '@tenda/shared'
import { escrow_proofs } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED, useTestApp, createTransactableUser, createUser, createEscrow, authHeader,
  attachExchangeDetails, attachGigDetails,
} from '../helpers/test-app'
import { partiedEscrow, proofUrl } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

// ---------- accept ---------------------------------------------------------------

test('POST accept: 401 without a token', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const e = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  const res = await app.inject({ method: 'POST', url: `/v1/escrows/${e.id}/accept` })
  assert.strictEqual(res.statusCode, 401)
})

test('POST accept: the assigned counterparty accepts an open escrow → unsigned tx', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createTransactableUser(app) // wallet + verified contact (9D gate)
  const e = await createEscrow(app, {
    creator_id: creator.row.id, status: 'open', assigned_counterparty_id: worker.row.id,
  })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/accept`, headers: authHeader(worker.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned, 'returns an unsigned tx')
})

test('POST accept: a stranger accepts a public (unassigned) open escrow → unsigned tx', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const stranger = await createTransactableUser(app)
  const e = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/accept`, headers: authHeader(stranger.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned, 'returns an unsigned tx')
})

test('POST accept: a stranger takes a public (unassigned) exchange order → unsigned tx', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const taker = await createTransactableUser(app)
  const e = await createEscrow(app, { creator_id: creator.row.id, status: 'open', kind: 'exchange' })
  await attachExchangeDetails(app, e.id)
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/accept`, headers: authHeader(taker.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned, 'returns an unsigned tx')
})

test('POST accept: the creator cannot accept their own public escrow', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const e = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/accept`, headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 403)
})

test('POST accept: the creator cannot accept their own escrow', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const e = await createEscrow(app, {
    creator_id: creator.row.id, status: 'open', assigned_counterparty_id: worker.row.id,
  })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/accept`, headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 403)
})

test('POST accept: a stranger cannot accept an escrow assigned to someone else', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const stranger = await createUser(app)
  const e = await createEscrow(app, {
    creator_id: creator.row.id, status: 'open', assigned_counterparty_id: worker.row.id,
  })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/accept`, headers: authHeader(stranger.token),
  })
  assert.strictEqual(res.statusCode, 403)
})

test('POST accept: 409 when the escrow is not open', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await partiedEscrow(app, 'accepted')
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/accept`, headers: authHeader(worker.token),
  })
  assert.strictEqual(res.statusCode, 409)
})

// ---------- decline --------------------------------------------------------------

test('POST decline: the assigned counterparty declines an open escrow', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const e = await createEscrow(app, {
    creator_id: creator.row.id, status: 'open', assigned_counterparty_id: worker.row.id,
  })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/decline`, headers: authHeader(worker.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned)
})

// ---------- submit ---------------------------------------------------------------

// Accepted escrows always carry a completion_deadline in production (accept
// stamps it); set it so the submit window check (completion_deadline+grace)
// has a real date instead of null.
async function acceptedEscrow(app: ReturnType<typeof getApp>) {
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'accepted',
    completion_deadline: new Date(Date.now() + 86_400_000),
  })
  return { creator, worker, escrow }
}

test('POST submit: the counterparty submits an accepted escrow', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await acceptedEscrow(app)
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/submit`, headers: authHeader(worker.token),
    payload: { proof_hash: `0x${'a'.repeat(64)}` },
  })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned)
})

test('POST submit: the creator cannot submit (only the counterparty)', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await acceptedEscrow(app)
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/submit`, headers: authHeader(creator.token),
    payload: { proof_hash: `0x${'a'.repeat(64)}` },
  })
  assert.strictEqual(res.statusCode, 403)
})

// ---------- approve --------------------------------------------------------------

test('POST approve: the creator approves a submitted escrow', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await partiedEscrow(app, 'submitted')
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/approve`, headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned)
})

test('POST approve: the counterparty cannot approve', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await partiedEscrow(app, 'submitted')
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${escrow.id}/approve`, headers: authHeader(worker.token),
  })
  assert.strictEqual(res.statusCode, 403)
})

// ---------- cancel ---------------------------------------------------------------

test('POST cancel: the creator cancels an open escrow', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const e = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/cancel`, headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned)
})

test('POST cancel: a stranger cannot cancel', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const stranger = await createUser(app)
  const e = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/cancel`, headers: authHeader(stranger.token),
  })
  assert.strictEqual(res.statusCode, 403)
})

test('POST refund: creator gets an unsigned refund for an expired open escrow', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const e = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    accept_deadline: new Date(Date.now() - 60_000),
  })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/refund`, headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned)
})

test('POST refund: refuses an open escrow before its accept deadline', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const e = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    accept_deadline: new Date(Date.now() + 60_000),
  })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/refund`, headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, ErrorCode.ESCROW_DEADLINE_NOT_REACHED)
})

test('POST <transition>: 404 for an unknown escrow id', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/escrows/00000000-0000-0000-0000-000000000000/accept',
    headers: authHeader(u.token),
  })
  assert.strictEqual(res.statusCode, 404)
})

// ---------- submit: poster-declared proof requirements ---------------------------
//
// The gate lives in the submit route (not /proofs) so incremental uploads stay
// unrestricted and the worker is stopped before they sign, not after.

/** Accepted gig + listing satellite carrying the poster's requirement. */
async function gigRequiring(app: ReturnType<typeof getApp>, required: ProofType[]) {
  const parties = await acceptedEscrow(app)
  await attachGigDetails(app, parties.escrow.id, { proof_requirements: required })
  return parties
}

async function attachProof(
  app: ReturnType<typeof getApp>,
  escrow_id: string,
  userId: string,
  type: ProofType,
) {
  await app.db.insert(escrow_proofs).values({ escrow_id, url: proofUrl(userId, 1), type })
}

function submitAs(app: ReturnType<typeof getApp>, escrow_id: string, token: string) {
  return app.inject({
    method: 'POST', url: `/v1/escrows/${escrow_id}/submit`, headers: authHeader(token),
    payload: { proof_hash: `0x${'a'.repeat(64)}` },
  })
}

test('POST submit: refused when a required proof type is missing', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await gigRequiring(app, ['image'])
  const res = await submitAs(app, escrow.id, worker.token)
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, ErrorCode.PROOF_REQUIREMENT_UNMET)
})

test('POST submit: allowed once the required type is attached', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await gigRequiring(app, ['image'])
  await attachProof(app, escrow.id, worker.row.id, 'image')
  const res = await submitAs(app, escrow.id, worker.token)
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().unsigned)
})

test('POST submit: a proof of the wrong type does not satisfy the requirement', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await gigRequiring(app, ['video'])
  await attachProof(app, escrow.id, worker.row.id, 'image')
  const res = await submitAs(app, escrow.id, worker.token)
  assert.strictEqual(res.statusCode, 409)
  assert.match(res.json().message, /video/)
})

test('POST submit: partial coverage names only the missing type', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await gigRequiring(app, ['image', 'video'])
  await attachProof(app, escrow.id, worker.row.id, 'image')
  const res = await submitAs(app, escrow.id, worker.token)
  assert.strictEqual(res.statusCode, 409)
  const { message } = res.json()
  assert.match(message, /video/)
  assert.ok(!/photo/i.test(message), 'satisfied type should not be listed as missing')
})

test('POST submit: an empty requirement list keeps the pre-existing behaviour', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await gigRequiring(app, [])
  const res = await submitAs(app, escrow.id, worker.token)
  assert.strictEqual(res.statusCode, 200)
})

test('POST submit: a gig with no listing satellite is ungated', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await acceptedEscrow(app)
  const res = await submitAs(app, escrow.id, worker.token)
  assert.strictEqual(res.statusCode, 200)
})

test('POST submit: exchange escrows are never proof-gated', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'accepted',
    kind: 'exchange', completion_deadline: new Date(Date.now() + 86_400_000),
  })
  const res = await submitAs(app, escrow.id, worker.token)
  assert.strictEqual(res.statusCode, 200)
})

test('POST submit: the requirement gate does not override the caller check', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await gigRequiring(app, ['image'])
  const res = await submitAs(app, escrow.id, creator.token)
  assert.strictEqual(res.statusCode, 403)
})

test('POST submit: rejects a missing or empty proof_hash before any gating', { skip }, async () => {
  const app = getApp()
  const { worker, escrow } = await gigRequiring(app, ['image'])
  for (const payload of [{}, { proof_hash: '' }]) {
    const res = await app.inject({
      method: 'POST', url: `/v1/escrows/${escrow.id}/submit`,
      headers: authHeader(worker.token), payload,
    })
    assert.strictEqual(res.statusCode, 400, `payload ${JSON.stringify(payload)}`)
    assert.strictEqual(res.json().code, ErrorCode.VALIDATION_ERROR)
  }
})

test('POST decline: an assigned buyer declines an EXCHANGE offer', { skip }, async () => {
  // The gig case is covered above; this is the kind that had never been run.
  // The exchange CTA offers Decline (a direct offer names its buyer, and an
  // invitation with no way to say no just hangs on their screen), so this route
  // is now reachable with kind='exchange' — and `buildEscrowTx` loads the
  // kind-specific satellite, which is where a gig-only assumption would surface
  // as a 500 on a button the user can actually press.
  const app = getApp()
  const seller = await createUser(app)
  const buyer = await createUser(app)
  const e = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
    assigned_counterparty_id: buyer.row.id,
  })
  await attachExchangeDetails(app, e.id)

  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/decline`, headers: authHeader(buyer.token),
  })
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.json()))
  assert.ok(res.json().unsigned)
})
