/**
 * Issue-3 propose→sign resolution queue:
 *   POST /v1/admin/disputes/:id/resolution   — mediator proposes (claim-held)
 *   GET  /v1/admin/disputes/:id/resolution   — latest proposal / null
 *   GET  /v1/admin/resolutions?status=        — signing queue
 *   POST /v1/admin/resolutions/:id/reject     — key-holder returns it
 * plus the on-chain confirm hook (DisputeResolved → proposal 'confirmed').
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { disputes, dispute_resolutions, escrows } from '@tenda/shared/db/schema'
import type { DisputeSummary, ResolutionWinner } from '@tenda/shared'
import { drizzleEscrowEventStore } from '@server/lib/escrow-events'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  authHeader,
  FAKE_UNSIGNED,
  FAKE_DISPUTE_AUTHORITY,
  TEST_CHAIN_ID,
  FAKE_SOLANA_PROGRAM,
  type TestUser,
} from '../helpers/test-app'
import { buildContractRegistry } from '@server/chains/contracts'
import { disputedEscrow } from '../helpers/escrow-states'
import { buildResolveTx } from '@server/lib/escrow/resolve-tx'
import type { FastifyInstance } from 'fastify'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** A disputed escrow whose dispute is already claimed by a fresh mediator. */
async function claimedDispute(
  app: FastifyInstance,
  /** Name the mediator when the assertion is about how they are RENDERED. */
  mediatorOverrides: { first_name?: string; last_name?: string } = {},
): Promise<{
  escrow_id: string
  dispute_id: string
  mediator: TestUser
}> {
  const { escrow, dispute_id } = await disputedEscrow(app)
  const mediator = await createUser(app, { role: 'dispute_admin', ...mediatorOverrides })
  const claim = await app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${dispute_id}/claim`,
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(claim.statusCode, 200)
  return { escrow_id: escrow.id, dispute_id, mediator }
}

function propose(app: FastifyInstance, disputeId: string, token: string, winner = 'creator') {
  return app.inject({
    method: 'POST',
    url: `/v1/admin/disputes/${disputeId}/resolution`,
    headers: authHeader(token),
    payload: { winner },
  })
}

/** Simulate the verify-tx apply path landing an on-chain DisputeResolved. */
function landResolution(app: FastifyInstance, escrow_id: string, winner: ResolutionWinner) {
  return drizzleEscrowEventStore(app.db).applyEvent({
    escrow_id,
    from: ['disputed'],
    patch: { status: 'resolved' },
    transaction: {
      type: 'resolve',
      tx_ref: `resolve-${escrow_id}`,
      amount_raw: null,
      platform_fee_raw: null,
      creator_payout_raw: null,
      actor_id: null,
    },
    disputeResolution: { winner },
  })
}

/** GET the triage queue, asserting the 200 so callers read a body, not a code. */
async function listDisputes(
  app: FastifyInstance,
  token: string,
  query = '',
): Promise<{ total: number; rows: DisputeSummary[] }> {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/admin/disputes${query}`,
    headers: authHeader(token),
  })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  return { total: body.total, rows: body.data }
}

const idsOf = (rows: DisputeSummary[]): string[] => rows.map((d) => d.dispute_id)

/** Locate a row, failing by NAME rather than reading fields off undefined. */
function mustFind(rows: DisputeSummary[], dispute_id: string): DisputeSummary {
  const row = rows.find((d) => d.dispute_id === dispute_id)
  assert.ok(row !== undefined, `dispute ${dispute_id} is missing from the queue page`)
  return row
}

/** The settlement stamp: what the apply path wrote onto the dispute row. */
async function readStamp(app: FastifyInstance, dispute_id: string) {
  const [row] = await app.db
    .select({ winner: disputes.winner, resolved_at: disputes.resolved_at, resolved_by: disputes.resolved_by })
    .from(disputes)
    .where(eq(disputes.id, dispute_id))
  return row
}

test('propose: a mediator not holding the claim is refused', { skip }, async () => {
  const app = getApp()
  const { dispute_id } = await disputedEscrow(app)
  const other = await createUser(app, { role: 'dispute_admin' })
  const res = await propose(app, dispute_id, other.token)
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'DISPUTE_NOT_CLAIMED')
})

test('propose: claim-holder records a pending proposal, visible in queue + detail', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  const res = await propose(app, dispute_id, mediator.token, 'counterparty')
  assert.strictEqual(res.statusCode, 200)
  const proposal = res.json()
  assert.strictEqual(proposal.status, 'pending')
  assert.strictEqual(proposal.proposed_winner, 'counterparty')
  assert.strictEqual(proposal.threshold, 1)

  // Detail endpoint returns the same proposal.
  const detail = await app.inject({
    method: 'GET',
    url: `/v1/admin/disputes/${dispute_id}/resolution`,
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(detail.json().id, proposal.id)
  // The read carries the sign context so the panel can reactively gate signing.
  assert.strictEqual(detail.json().chain_id, TEST_CHAIN_ID)
  assert.strictEqual(detail.json().dispute_admin_authority, FAKE_DISPUTE_AUTHORITY)

  // Signing queue (default 'pending') includes it with escrow context.
  const queue = await app.inject({
    method: 'GET',
    url: '/v1/admin/resolutions',
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(queue.statusCode, 200)
  const found = queue.json().data.find((r: { id: string }) => r.id === proposal.id)
  assert.ok(found, 'proposal appears in the pending queue')
  assert.strictEqual(found.kind, 'gig')

  // INVARIANT: a pending proposal must NOT resolve the dispute (thread live).
  const [d] = await app.db.select({ resolved_at: disputes.resolved_at }).from(disputes).where(eq(disputes.id, dispute_id))
  assert.strictEqual(d.resolved_at, null)
})

test('propose: a second proposal is rejected while one is active', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  assert.strictEqual((await propose(app, dispute_id, mediator.token)).statusCode, 200)
  const dup = await propose(app, dispute_id, mediator.token, 'split')
  assert.strictEqual(dup.statusCode, 409)
  assert.strictEqual(dup.json().code, 'RESOLUTION_ALREADY_EXISTS')
})

test('propose: bad winner → 400', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  const res = await propose(app, dispute_id, mediator.token, 'nobody')
  assert.strictEqual(res.statusCode, 400)
})

test('propose: escrow not in disputed status → 409', { skip }, async () => {
  const app = getApp()
  // Claim a dispute, then force the escrow out of 'disputed'.
  const { escrow_id, dispute_id, mediator } = await claimedDispute(app)
  await app.db.update(escrows).set({ status: 'accepted' }).where(eq(escrows.id, escrow_id))
  const res = await propose(app, dispute_id, mediator.token)
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'ESCROW_WRONG_STATUS')
})

test('propose: already-resolved dispute → 409 DISPUTE_RESOLVED', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  await app.db.update(disputes).set({ resolved_at: new Date(), winner: 'creator' }).where(eq(disputes.id, dispute_id))
  const res = await propose(app, dispute_id, mediator.token)
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'DISPUTE_RESOLVED')
})

test('reject: a mediator without disputes.execute is refused', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token)).json()
  const res = await app.inject({
    method: 'POST',
    url: `/v1/admin/resolutions/${proposal.id}/reject`,
    headers: authHeader(mediator.token),
    payload: { reason: 'Wrong call, revisit the proofs' },
  })
  assert.strictEqual(res.statusCode, 403)
})

test('reject: a key-holder returns the proposal, reopening it for a new one', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token)).json()
  const signer = await createUser(app, { role: 'super_admin' })

  const rejected = await app.inject({
    method: 'POST',
    url: `/v1/admin/resolutions/${proposal.id}/reject`,
    headers: authHeader(signer.token),
    payload: { reason: 'The worker actually delivered; siding with counterparty' },
  })
  assert.strictEqual(rejected.statusCode, 200)
  assert.strictEqual(rejected.json().status, 'rejected')

  // Rejecting the same proposal again is a no-op conflict.
  const again = await app.inject({
    method: 'POST',
    url: `/v1/admin/resolutions/${proposal.id}/reject`,
    headers: authHeader(signer.token),
    payload: { reason: 'again' },
  })
  assert.strictEqual(again.statusCode, 409)
  assert.strictEqual(again.json().code, 'RESOLUTION_NOT_ACTIVE')

  // The dispute is reopened: a fresh proposal is allowed.
  const reproposed = await propose(app, dispute_id, mediator.token, 'counterparty')
  assert.strictEqual(reproposed.statusCode, 200)
})

test('reject: empty reason → 400, unknown id → 404', { skip }, async () => {
  const app = getApp()
  const signer = await createUser(app, { role: 'super_admin' })
  const { dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token)).json()

  const empty = await app.inject({
    method: 'POST',
    url: `/v1/admin/resolutions/${proposal.id}/reject`,
    headers: authHeader(signer.token),
    payload: { reason: '   ' },
  })
  assert.strictEqual(empty.statusCode, 400)

  const missing = await app.inject({
    method: 'POST',
    url: `/v1/admin/resolutions/00000000-0000-0000-0000-000000000000/reject`,
    headers: authHeader(signer.token),
    payload: { reason: 'no such row' },
  })
  assert.strictEqual(missing.statusCode, 404)
})

test('queue: an invalid status filter → 400', { skip }, async () => {
  const app = getApp()
  const admin = await createUser(app, { role: 'dispute_admin' })
  const res = await app.inject({
    method: 'GET',
    url: '/v1/admin/resolutions?status=bogus',
    headers: authHeader(admin.token),
  })
  assert.strictEqual(res.statusCode, 400)
})

test('detail: no proposal yet returns null', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  const res = await app.inject({
    method: 'GET',
    url: `/v1/admin/disputes/${dispute_id}/resolution`,
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json(), null)
})

test('buildResolveTx: an escrow with no dispute record is a 409 (defensive)', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: creator.row.id, status: 'disputed' })
  await assert.rejects(
    buildResolveTx(
      { db: app.db, chains: app.chains, contracts: app.contracts },
      {
        escrow: { id: escrow.id, chain_id: escrow.chain_id, escrow_contract: null },
        winner: 'creator',
        signer_user_id: creator.row.id,
      },
    ),
    (e: unknown) => e instanceof Error && 'statusCode' in e && e.statusCode === 409,
  )
})

test('buildResolveTx: chain with no configured dispute authority → 409 CHAIN_NOT_CONFIGURED', { skip }, async () => {
  const app = getApp()
  const { escrow_id } = await claimedDispute(app)
  // An adapter that carries no dispute authority (e.g. the env var is unset):
  // the resolve build must refuse rather than fall back to a user's wallet.
  const base = app.chains.get(TEST_CHAIN_ID)
  const chains = { ...app.chains, get: () => ({ ...base, disputeAuthority: undefined }) }
  await assert.rejects(
    buildResolveTx(
      { db: app.db, chains, contracts: app.contracts },
      {
        escrow: { id: escrow_id, chain_id: TEST_CHAIN_ID, escrow_contract: null },
        winner: 'creator',
        signer_user_id: 'irrelevant',
      },
    ),
    (e: unknown) => e instanceof Error && 'code' in e && e.code === 'CHAIN_NOT_CONFIGURED',
  )
})

function executeBuild(app: FastifyInstance, resolutionId: string, token: string) {
  return app.inject({
    method: 'POST',
    url: `/v1/admin/resolutions/${resolutionId}/execute-build`,
    headers: authHeader(token),
  })
}

test('execute-build: a mediator without disputes.execute is refused', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token)).json()
  const res = await executeBuild(app, proposal.id, mediator.token)
  assert.strictEqual(res.statusCode, 403)
})

test('execute-build: signer gets the unsigned tx for the STORED winner and it goes executing', { skip }, async () => {
  const app = getApp()
  const { escrow_id, dispute_id, mediator } = await claimedDispute(app)
  // Mediator proposes 'split'; the signer must not be able to change that.
  const proposal = (await propose(app, dispute_id, mediator.token, 'split')).json()
  const signer = await createUser(app, { role: 'super_admin' })

  const res = await executeBuild(app, proposal.id, signer.token)
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.strictEqual(body.resolution_id, proposal.id)
  assert.strictEqual(body.escrow_id, escrow_id)
  assert.strictEqual(body.proposed_winner, 'split') // the reviewed winner, not a request input
  assert.deepStrictEqual(body.unsigned, FAKE_UNSIGNED)

  const [row] = await app.db.select().from(dispute_resolutions).where(eq(dispute_resolutions.id, proposal.id))
  assert.strictEqual(row.status, 'executing')

  // Re-building an already-executing proposal is idempotent (signer retries).
  const again = await executeBuild(app, proposal.id, signer.token)
  assert.strictEqual(again.statusCode, 200)
})

test('execute-build: escrow no longer disputed → 409', { skip }, async () => {
  const app = getApp()
  const { escrow_id, dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token)).json()
  const signer = await createUser(app, { role: 'super_admin' })
  await app.db.update(escrows).set({ status: 'accepted' }).where(eq(escrows.id, escrow_id))
  const res = await executeBuild(app, proposal.id, signer.token)
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'ESCROW_WRONG_STATUS')
})

test('execute-build: a rejected proposal cannot be built, unknown id → 404', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token)).json()
  const signer = await createUser(app, { role: 'super_admin' })
  await app.inject({
    method: 'POST',
    url: `/v1/admin/resolutions/${proposal.id}/reject`,
    headers: authHeader(signer.token),
    payload: { reason: 'not this outcome' },
  })
  const rejected = await executeBuild(app, proposal.id, signer.token)
  assert.strictEqual(rejected.statusCode, 409)
  assert.strictEqual(rejected.json().code, 'RESOLUTION_NOT_ACTIVE')

  const missing = await executeBuild(app, '00000000-0000-0000-0000-000000000000', signer.token)
  assert.strictEqual(missing.statusCode, 404)
})

function broadcast(app: FastifyInstance, resolutionId: string, token: string, tx_ref = 'sig-abc') {
  return app.inject({
    method: 'POST',
    url: `/v1/admin/resolutions/${resolutionId}/broadcast`,
    headers: authHeader(token),
    payload: { tx_ref },
  })
}

test('broadcast: rejected before the proposal has been built (still pending) → 409', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token)).json()
  const signer = await createUser(app, { role: 'super_admin' })
  const res = await broadcast(app, proposal.id, signer.token)
  assert.strictEqual(res.statusCode, 409)
  assert.strictEqual(res.json().code, 'RESOLUTION_NOT_ACTIVE')
})

test('broadcast: after build, a signer pings the tx ref and it queues (202)', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token)).json()
  const signer = await createUser(app, { role: 'super_admin' })
  await executeBuild(app, proposal.id, signer.token)
  const res = await broadcast(app, proposal.id, signer.token, 'sig-resolve-1')
  assert.strictEqual(res.statusCode, 202)
  assert.strictEqual(res.json().status, 'queued')
})

test('broadcast: missing tx_ref → 400; a mediator without execute → 403', { skip }, async () => {
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token)).json()
  const signer = await createUser(app, { role: 'super_admin' })
  await executeBuild(app, proposal.id, signer.token)

  const noRef = await broadcast(app, proposal.id, signer.token, '')
  assert.strictEqual(noRef.statusCode, 400)

  const forbidden = await broadcast(app, proposal.id, mediator.token, 'sig-x')
  assert.strictEqual(forbidden.statusCode, 403)
})

test('execute-build → confirm hook: an executing proposal confirms on DisputeResolved', { skip }, async () => {
  const app = getApp()
  const { escrow_id, dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token, 'counterparty')).json()
  const signer = await createUser(app, { role: 'super_admin' })
  assert.strictEqual((await executeBuild(app, proposal.id, signer.token)).statusCode, 200)

  await landResolution(app, escrow_id, 'counterparty')
  const [row] = await app.db.select().from(dispute_resolutions).where(eq(dispute_resolutions.id, proposal.id))
  assert.strictEqual(row.status, 'confirmed')
  assert.strictEqual(row.resolved_tx_ref, `resolve-${escrow_id}`)
})

test('confirm hook: DisputeResolved marks the active proposal confirmed', { skip }, async () => {
  const app = getApp()
  const { escrow_id, dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token, 'split')).json()

  const outcome = await landResolution(app, escrow_id, 'split')
  assert.strictEqual(outcome.applied, true)

  const [row] = await app.db.select().from(dispute_resolutions).where(eq(dispute_resolutions.id, proposal.id))
  assert.strictEqual(row.status, 'confirmed')
  assert.strictEqual(row.resolved_tx_ref, `resolve-${escrow_id}`)

  // And the dispute is now resolved (thread freezes) — set by the apply path.
  const stamp = await readStamp(app, dispute_id)
  assert.notStrictEqual(stamp.resolved_at, null)
  assert.strictEqual(stamp.winner, 'split')
})

test('confirm hook: resolved_by names the PROPOSING mediator, not the signer', { skip }, async () => {
  // The design question this pins: the resolve tx is signed with the chain's
  // shared dispute-authority key by a `disputes.execute` holder, who is a
  // different person from the `disputes.mediate` mediator whose verdict it is
  // (dispute_admin cannot sign; only super_admin holds both). Copying the
  // signer here would credit the wrong admin for the decision — and would
  // still look "populated", which is why the not-signer assertion matters.
  const app = getApp()
  const { escrow_id, dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token, 'counterparty')).json()
  const signer = await createUser(app, { role: 'super_admin' })
  assert.strictEqual((await executeBuild(app, proposal.id, signer.token)).statusCode, 200)

  await landResolution(app, escrow_id, 'counterparty')

  const stamp = await readStamp(app, dispute_id)
  assert.strictEqual(stamp.resolved_by, mediator.row.id)
  assert.notStrictEqual(stamp.resolved_by, signer.row.id)
})

test('confirm hook: no proposal → the dispute still resolves, resolved_by stays null', { skip }, async () => {
  // Direct-resolve/CLI bypasses the propose flow, so nobody authored a
  // verdict. Null is the honest answer; the stamp must NOT become
  // conditional on a proposal existing, or that path would leave the thread
  // live and the escrow settled.
  const app = getApp()
  const { escrow_id, dispute_id } = await claimedDispute(app)

  const outcome = await landResolution(app, escrow_id, 'creator')
  assert.strictEqual(outcome.applied, true)

  const stamp = await readStamp(app, dispute_id)
  assert.notStrictEqual(stamp.resolved_at, null)
  assert.strictEqual(stamp.winner, 'creator')
  assert.strictEqual(stamp.resolved_by, null)
})

test('confirm hook: a REJECTED proposal does not get credited as the resolver', { skip }, async () => {
  // A rejected proposal still carries a proposed_by, so reading the latest
  // proposal instead of the one this commit CONFIRMED would name a mediator
  // whose verdict was explicitly thrown out.
  const app = getApp()
  const { escrow_id, dispute_id, mediator } = await claimedDispute(app)
  const proposal = (await propose(app, dispute_id, mediator.token)).json()
  const signer = await createUser(app, { role: 'super_admin' })
  const rejected = await app.inject({
    method: 'POST',
    url: `/v1/admin/resolutions/${proposal.id}/reject`,
    headers: authHeader(signer.token),
    payload: { reason: 'Proofs do not support this outcome' },
  })
  assert.strictEqual(rejected.statusCode, 200)

  await landResolution(app, escrow_id, 'split')

  const stamp = await readStamp(app, dispute_id)
  assert.strictEqual(stamp.resolved_by, null)
  // The rejected proposal is left rejected, not swept into 'confirmed'.
  const [row] = await app.db.select().from(dispute_resolutions).where(eq(dispute_resolutions.id, proposal.id))
  assert.strictEqual(row.status, 'rejected')
})

test('queue: the wire NAMES the resolver, and the join stays LEFT', { skip }, async () => {
  // Same failure mode as the mediator join: an inner join on resolved_by would
  // drop every UNRESOLVED dispute, and since the count query joins no users at
  // all it surfaces as total disagreeing with data.length, not as an error.
  const app = getApp()
  const resolvedCase = await claimedDispute(app, { first_name: 'Rita', last_name: 'Resolver' })
  const openCase = await claimedDispute(app)
  await propose(app, resolvedCase.dispute_id, resolvedCase.mediator.token, 'creator')
  await landResolution(app, resolvedCase.escrow_id, 'creator')

  const { total, rows } = await listDisputes(app, resolvedCase.mediator.token)
  assert.strictEqual(total, rows.length)

  const resolved = mustFind(rows, resolvedCase.dispute_id)
  assert.strictEqual(resolved.resolved_by_id, resolvedCase.mediator.row.id)
  assert.strictEqual(resolved.resolved_by_first_name, 'Rita')
  assert.strictEqual(resolved.resolved_by_last_name, 'Resolver')

  // A live dispute is present AND carries explicit nulls — not the resolved
  // row's name bleeding across from a mis-keyed join.
  const open = mustFind(rows, openCase.dispute_id)
  assert.strictEqual(open.resolved_by_id, null)
  assert.strictEqual(open.resolved_by_first_name, null)
  assert.strictEqual(open.resolved_by_last_name, null)
})

test('queue: status partitions the triage list, and open means ON-CHAIN live', { skip }, async () => {
  // Two conditions hide behind `status=open`, and the second one is the
  // subtle one: the triage row is upserted when a dispute is REQUESTED, so an
  // attempt whose on-chain dispute never confirmed leaves a row pointing at an
  // escrow that is not disputed. Filtering on resolved_at alone would park
  // that phantom at the top of the actionable queue forever.
  const app = getApp()
  const live = await claimedDispute(app)
  const settled = await claimedDispute(app)
  const abandoned = await claimedDispute(app)
  const viewer = live.mediator.token

  await propose(app, settled.dispute_id, settled.mediator.token, 'creator')
  await landResolution(app, settled.escrow_id, 'creator')
  await app.db.update(escrows).set({ status: 'accepted' }).where(eq(escrows.id, abandoned.escrow_id))

  // Unfiltered first: all three rows exist, so the filters below are proven to
  // EXCLUDE rather than merely to miss rows that were never created.
  const all = await listDisputes(app, viewer)
  assert.strictEqual(all.total, 3)
  for (const id of [live.dispute_id, settled.dispute_id, abandoned.dispute_id]) {
    assert.ok(idsOf(all.rows).includes(id), `unfiltered queue is missing ${id}`)
  }

  const open = await listDisputes(app, viewer, '?status=open')
  assert.deepStrictEqual(idsOf(open.rows), [live.dispute_id])
  // total comes from a SEPARATE count query — assert it, or a filter applied to
  // only one of the two would page the queue against the wrong denominator.
  assert.strictEqual(open.total, 1)

  const resolved = await listDisputes(app, viewer, '?status=resolved')
  assert.deepStrictEqual(idsOf(resolved.rows), [settled.dispute_id])
  assert.strictEqual(resolved.total, 1)
})

test('queue: EVERY enum filter is refused when unrecognised, not silently unfiltered', { skip }, async () => {
  // Failing open here is worse than failing loudly: a typo'd filter returned
  // the whole queue — resolved disputes included — while the UI still showed
  // the filter as applied, so it read as "nothing to triage" instead of as an
  // error. Mirrors GET /v1/admin/resolutions. Narrowing semantics are unit
  // tested; this pins that the route actually WIRES all three narrowers, which
  // is where two of them were missing.
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)

  for (const field of ['status', 'kind', 'assigned']) {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/admin/disputes?${field}=banana`,
      headers: authHeader(mediator.token),
    })
    assert.strictEqual(res.statusCode, 400, `${field}=banana should be refused`)
    assert.strictEqual(res.json().code, 'VALIDATION_ERROR')
    // Names the offending field, so a caller sending several filters at once
    // learns WHICH one to fix.
    assert.ok(res.json().message.startsWith(`${field} must be one of:`), res.json().message)
  }

  // Legal values on the newly-guarded filters still pass through and FILTER,
  // rather than being rejected along with the typos.
  const gigs = await listDisputes(app, mediator.token, '?kind=gig&assigned=me')
  assert.deepStrictEqual(idsOf(gigs.rows), [dispute_id])
  const exchanges = await listDisputes(app, mediator.token, '?kind=exchange')
  assert.deepStrictEqual(idsOf(exchanges.rows), [])

  // An EMPTY value is a cleared filter, not a typo — same rule the `party`
  // filter follows — so the queue still comes back.
  const cleared = await listDisputes(app, mediator.token, '?status=&kind=&assigned=&party=')
  assert.deepStrictEqual(idsOf(cleared.rows), [dispute_id])
})

test('queue: a malformed party is a 400, not the 500 the uuid cast used to throw', { skip }, async () => {
  // `party` carries no vocabulary, so it slipped past the enum narrowers and
  // reached postgres as a uuid comparison: `invalid input syntax for type
  // uuid` → 500. An admin following a stale user cross-link was told the
  // server had fallen over.
  const app = getApp()
  const { dispute_id, mediator } = await claimedDispute(app)

  const bad = await app.inject({
    method: 'GET',
    url: '/v1/admin/disputes?party=banana',
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(bad.statusCode, 400)
  assert.strictEqual(bad.json().code, 'VALIDATION_ERROR')
  assert.ok(bad.json().message.startsWith('party must be'), bad.json().message)

  // A well-formed id that matches nobody still runs the query and pages empty
  // — shape is all that is checked, so this must NOT become a 400 too.
  const nobody = await listDisputes(app, mediator.token, '?party=00000000-0000-0000-0000-000000000000')
  assert.deepStrictEqual(idsOf(nobody.rows), [])
  assert.strictEqual(nobody.total, 0)

  // And a real party id still filters to their disputes.
  const creatorId = (await app.db.select({ id: escrows.creator_id }).from(escrows).limit(1))[0].id
  const mine = await listDisputes(app, mediator.token, `?party=${creatorId}`)
  assert.deepStrictEqual(idsOf(mine.rows), [dispute_id])
})

test('a malformed :id is a 404 on EVERY dispute route, never a 500', { skip }, async () => {
  // Each of these reached the driver as a uuid comparison and threw, so the
  // caller was told the server had fallen over. They are covered as a SET
  // because the defect was five handlers each independently forgetting the
  // guard — asserting one would leave the next one free to regress.
  const app = getApp()
  const admin = await createUser(app, { role: 'super_admin' })
  const routes: { method: 'GET' | 'POST'; url: string; payload?: object }[] = [
    { method: 'GET', url: '/v1/admin/disputes/banana' },
    { method: 'POST', url: '/v1/admin/disputes/banana/claim' },
    { method: 'POST', url: '/v1/admin/disputes/banana/release' },
    { method: 'GET', url: '/v1/admin/disputes/banana/resolution' },
    { method: 'POST', url: '/v1/admin/disputes/banana/resolution', payload: { winner: 'creator' } },
  ]
  for (const { method, url, payload } of routes) {
    const res = await app.inject({ method, url, headers: authHeader(admin.token), payload })
    assert.strictEqual(res.statusCode, 404, `${method} ${url} should 404`)
    assert.strictEqual(res.json().code, 'NOT_FOUND')
  }

  // A WELL-FORMED id that matches nothing must still reach the handler and
  // answer on its own terms — the guard is about shape, not existence. The
  // propose route answers 404 too here, but only after loading the dispute.
  const wellFormed = await app.inject({
    method: 'GET',
    url: '/v1/admin/disputes/00000000-0000-0000-0000-000000000000',
    headers: authHeader(admin.token),
  })
  assert.strictEqual(wellFormed.statusCode, 404)
})

test('a malformed :id is a 404 on EVERY resolution route too', { skip }, async () => {
  // Same defect, second plugin: these three reached the driver as a uuid
  // comparison and threw 500. Guarded at the plugin, so the message names the
  // RESOLUTION rather than borrowing the dispute wording.
  const app = getApp()
  const signer = await createUser(app, { role: 'super_admin' })
  const routes: { method: 'GET' | 'POST'; url: string; payload?: object }[] = [
    { method: 'POST', url: '/v1/admin/resolutions/banana/reject', payload: { reason: 'no' } },
    { method: 'POST', url: '/v1/admin/resolutions/banana/execute-build' },
    { method: 'POST', url: '/v1/admin/resolutions/banana/broadcast', payload: { tx_ref: 'sig-x' } },
  ]
  for (const { method, url, payload } of routes) {
    const res = await app.inject({ method, url, headers: authHeader(signer.token), payload })
    assert.strictEqual(res.statusCode, 404, `${method} ${url} should 404`)
    assert.strictEqual(res.json().code, 'NOT_FOUND')
    assert.strictEqual(res.json().message, 'Resolution not found')
  }

  // The collection route has no :id and must stay reachable — a guard that
  // fired on every request in the plugin would 404 the signing queue itself.
  const queue = await app.inject({
    method: 'GET',
    url: '/v1/admin/resolutions',
    headers: authHeader(signer.token),
  })
  assert.strictEqual(queue.statusCode, 200)
})

test('the :id guard runs AFTER auth — no token still means 401, not 404', { skip }, async () => {
  // A plugin-level preHandler that outran the admin router's authenticate hook
  // would answer strangers before checking them. Parent-scope hooks run first;
  // this pins that they still do.
  const app = getApp()
  const res = await app.inject({ method: 'GET', url: '/v1/admin/disputes/banana' })
  assert.strictEqual(res.statusCode, 401)
})

test('detail: the single-dispute route carries the resolver too, unknown id → 404', { skip }, async () => {
  // The detail route is where the resolver badge is actually READ (the header
  // of the page an admin works a dispute from). It shares summaryQuery with
  // the list, but "shares a function" is an inference, not a guarantee — this
  // route's whole body was uncovered until now.
  const app = getApp()
  const { escrow_id, dispute_id, mediator } = await claimedDispute(app, {
    first_name: 'Rita',
    last_name: 'Resolver',
  })
  await propose(app, dispute_id, mediator.token, 'split')
  await landResolution(app, escrow_id, 'split')

  const res = await app.inject({
    method: 'GET',
    url: `/v1/admin/disputes/${dispute_id}`,
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(res.statusCode, 200)
  const body = res.json()
  assert.strictEqual(body.dispute_id, dispute_id)
  assert.strictEqual(body.winner, 'split')
  assert.strictEqual(body.resolved_by_id, mediator.row.id)
  assert.strictEqual(body.resolved_by_first_name, 'Rita')
  assert.strictEqual(body.resolved_by_last_name, 'Resolver')

  const missing = await app.inject({
    method: 'GET',
    url: '/v1/admin/disputes/00000000-0000-0000-0000-000000000000',
    headers: authHeader(mediator.token),
  })
  assert.strictEqual(missing.statusCode, 404)
  assert.strictEqual(missing.json().code, 'NOT_FOUND')
})

// ---------- resolve routes by the escrow's contract (open_issues #89) --------

test('buildResolveTx targets the contract holding the escrow, not the current one', { skip }, async () => {
  // A dispute is the longest an escrow stays non-terminal, so it is the most
  // likely to outlive a redeploy — and the resolve transaction moves BOTH the
  // principal and the bond. Sent to the wrong contract it reverts, and the
  // dispute becomes unresolvable.
  const app = getApp()
  const { escrow } = await disputedEscrow(app)

  const PREVIOUS = 'PreviousProgram1111111111111111111111111'
  await app.db
    .update(escrows)
    .set({ escrow_contract: PREVIOUS })
    .where(eq(escrows.id, escrow.id))

  // Spy on what the adapter is asked to build against.
  const seen: Array<string | undefined> = []
  const base = app.chains.get(TEST_CHAIN_ID)
  const chains = {
    ...app.chains,
    get: () => ({
      ...base,
      buildTx: async (args: { contract?: string }) => {
        seen.push(args.contract)
        return FAKE_UNSIGNED
      },
    }),
  }
  // The registry must know the previous contract, or resolution is refused
  // outright — which is the OTHER half of the guarantee.
  const contracts = buildContractRegistry(
    [{ chain_id: TEST_CHAIN_ID, namespace: 'solana', escrowAddress: FAKE_SOLANA_PROGRAM }],
    [{ chain_id: TEST_CHAIN_ID, address: PREVIOUS }],
  )

  const [row] = await app.db
    .select({ escrow_contract: escrows.escrow_contract })
    .from(escrows)
    .where(eq(escrows.id, escrow.id))

  await buildResolveTx(
    { db: app.db, chains, contracts },
    {
      escrow: { id: escrow.id, chain_id: TEST_CHAIN_ID, escrow_contract: row.escrow_contract },
      winner: 'creator',
      signer_user_id: 'irrelevant',
    },
  )

  assert.deepStrictEqual(seen, [PREVIOUS])
})

test('buildResolveTx REFUSES when the escrow names a contract the registry lost', { skip }, async () => {
  const app = getApp()
  const { escrow } = await disputedEscrow(app)

  await assert.rejects(
    buildResolveTx(
      { db: app.db, chains: app.chains, contracts: app.contracts },
      {
        escrow: {
          id: escrow.id,
          chain_id: TEST_CHAIN_ID,
          escrow_contract: 'ForgottenProgram11111111111111111111111',
        },
        winner: 'creator',
        signer_user_id: 'irrelevant',
      },
    ),
    (e: unknown) => e instanceof Error && 'code' in e && e.code === 'ESCROW_MISMATCH',
  )
})
