/**
 * What a PAUSED chain still lets you do: the takedown rule, applied to a chain.
 *
 * Every test is the same pair as takedown-actions.test.ts, and the pair is the
 * point: a WAY IN is refused 422 CHAIN_PAUSED, and the matching WAY OUT still
 * answers a full 200. Blocking an exit would be the worse bug of the two — an
 * escrow on a paused chain can be holding locked funds, and its parties did
 * nothing wrong. Exits assert 200, not merely "some other code", for the reason
 * takedown-actions explains: a negative assertion cannot tell "the gate allowed
 * it" from "the request never got there".
 *
 * The chain is paused by setting the flag on the live manifest entry for the
 * length of the body (helpers/pause-chain), because the harness chains are real
 * manifest ids.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ErrorCode, apiRoutes } from '@tenda/shared'
import { escrows, gig_applications } from '@tenda/shared/db/schema'
import {
  TEST_CHAIN_ID,
  TEST_CHAIN_ID_ALT,
  TEST_DB_CONFIGURED,
  authHeader,
  createEscrow,
  createUser,
  seedAltChain,
  useTestApp,
} from '../helpers/test-app'
import { createEscrowBody, openGig } from '../helpers/escrow-states'
import { agentTaskBody, registerAgent } from '../helpers/agent'
import { withChainPaused } from '../helpers/pause-chain'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const HOUR_MS = 3_600_000
const inFuture = (hours: number) => new Date(Date.now() + hours * HOUR_MS)
const inPast = (hours: number) => new Date(Date.now() - hours * HOUR_MS)

function errorCode(res: { statusCode: number; json: () => unknown }): string | null {
  if (res.statusCode < 400) return null
  const body: unknown = res.json()
  if (typeof body !== 'object' || body === null || !('code' in body)) return null
  const { code } = body
  return typeof code === 'string' ? code : null
}

function assertPaused(res: { statusCode: number; json: () => unknown }, what: string): void {
  assert.strictEqual(res.statusCode, 422, `${what}: expected 422, got ${res.statusCode} ${JSON.stringify(res.json())}`)
  assert.strictEqual(errorCode(res), ErrorCode.CHAIN_PAUSED, `${what}: error code`)
}

function assertExitAllowed(res: { statusCode: number; json: () => unknown }, what: string): void {
  assert.strictEqual(res.statusCode, 200, `${what}: expected the exit to succeed, got ${res.statusCode} ${JSON.stringify(res.json())}`)
}

// ── ways IN ─────────────────────────────────────────────────────────────────

test('pause: a new escrow cannot be created on a paused chain, and the same body works once it is enabled', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const post = () => app.inject({ method: 'POST', url: apiRoutes.escrows.create, headers: authHeader(creator.token), payload: createEscrowBody() })
  await withChainPaused(TEST_CHAIN_ID, async () => assertPaused(await post(), 'creating on a paused chain'))
  assert.notStrictEqual(errorCode(await post()), ErrorCode.CHAIN_PAUSED, 'unpaused, the same call must not be refused as paused')
})

test('pause: an agent cannot post a task on a paused chain, and nothing is minted', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const agent = await registerAgent(app)
  for (const url of [apiRoutes.agent.tasks]) {
    const res = await withChainPaused(TEST_CHAIN_ID_ALT, () =>
      app.inject({ method: 'POST', url, headers: authHeader(agent.token), payload: agentTaskBody() }),
    )
    assertPaused(res, `agent post to ${url}`)
  }
  assert.strictEqual((await app.db.select({ id: escrows.id }).from(escrows)).length, 0, 'a refused post minted a draft')
})

test('pause: a stranger cannot accept an open gig on a paused chain', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app)
  const worker = await createUser(app)
  const res = await withChainPaused(TEST_CHAIN_ID, () =>
    app.inject({ method: 'POST', url: `/v1/escrows/${escrow.id}/accept`, headers: authHeader(worker.token) }),
  )
  assertPaused(res, 'accept on a paused chain')
})

test('pause: nobody can apply to a gig on a paused chain', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app, { escrow: { requires_approval: true } })
  const worker = await createUser(app)
  const res = await withChainPaused(TEST_CHAIN_ID, () =>
    app.inject({ method: 'POST', url: `/v1/gigs/${escrow.id}/applications`, headers: authHeader(worker.token), payload: { message: 'I can do this' } }),
  )
  assertPaused(res, 'apply on a paused chain')
})

test('pause: the poster cannot assign a worker on a paused chain', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await openGig(app, { escrow: { requires_approval: true } })
  const worker = await createUser(app)
  await app.db.insert(gig_applications).values({ escrow_id: escrow.id, applicant_id: worker.row.id, expires_at: new Date(Date.now() + 24 * HOUR_MS) })
  const res = await withChainPaused(TEST_CHAIN_ID, () =>
    app.inject({ method: 'POST', url: `/v1/escrows/${escrow.id}/assign`, headers: authHeader(creator.token), payload: { worker_user_id: worker.row.id } }),
  )
  assertPaused(res, 'assign on a paused chain')
})

test('pause: a draft on a paused chain cannot be published or funded, but can be deleted', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await openGig(app, { escrow: { status: 'draft' } })
  const publish = await withChainPaused(TEST_CHAIN_ID, () =>
    app.inject({ method: 'POST', url: `/v1/escrows/${escrow.id}/build-create`, headers: authHeader(creator.token) }),
  )
  assertPaused(publish, 'publishing a draft on a paused chain')
  // Discarding it is a way out, and the creator's own row.
  const remove = await withChainPaused(TEST_CHAIN_ID, () =>
    app.inject({ method: 'DELETE', url: `/v1/escrows/${escrow.id}`, headers: authHeader(creator.token) }),
  )
  assertExitAllowed(remove, 'deleting a draft on a paused chain')
})

// ── ways OUT: every one still builds ────────────────────────────────────────

test('pause: the poster can still cancel an open gig on a paused chain', { skip }, async () => {
  const app = getApp()
  const { creator, escrow } = await openGig(app)
  const res = await withChainPaused(TEST_CHAIN_ID, () =>
    app.inject({ method: 'POST', url: `/v1/escrows/${escrow.id}/cancel`, headers: authHeader(creator.token) }),
  )
  assertExitAllowed(res, 'poster cancelling on a paused chain')
})

test('pause: an accepted gig on a paused chain still submits and disputes', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'accepted',
    completion_deadline: inFuture(24), completion_duration_seconds: 86_400,
  })
  await withChainPaused(TEST_CHAIN_ID, async () => {
    assertExitAllowed(
      await app.inject({ method: 'POST', url: `/v1/escrows/${escrow.id}/submit`, headers: authHeader(worker.token), payload: { proof_hash: 'a'.repeat(64) } }),
      'worker submitting on a paused chain',
    )
    assertExitAllowed(
      await app.inject({ method: 'POST', url: `/v1/escrows/${escrow.id}/dispute`, headers: authHeader(creator.token), payload: { reason: 'Work was never delivered as agreed', bond_raw: '1000' } }),
      'poster disputing on a paused chain',
    )
  })
})

test('pause: an abandoned gig on a paused chain can still be reclaimed', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'accepted',
    completion_deadline: inPast(72), completion_duration_seconds: 86_400,
  })
  const res = await withChainPaused(TEST_CHAIN_ID, () =>
    app.inject({ method: 'POST', url: `/v1/escrows/${escrow.id}/refund`, headers: authHeader(creator.token) }),
  )
  assertExitAllowed(res, 'poster reclaiming on a paused chain')
})

test('pause: a submitted gig on a paused chain still approves and claims', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id, counterparty_id: worker.row.id, status: 'submitted', approval_deadline: inPast(1),
  })
  await withChainPaused(TEST_CHAIN_ID, async () => {
    assertExitAllowed(await app.inject({ method: 'POST', url: `/v1/escrows/${escrow.id}/claim`, headers: authHeader(worker.token) }), 'worker claiming on a paused chain')
    assertExitAllowed(await app.inject({ method: 'POST', url: `/v1/escrows/${escrow.id}/approve`, headers: authHeader(creator.token) }), 'poster approving on a paused chain')
  })
})

test('pause: an applicant can still WITHDRAW on a paused chain', { skip }, async () => {
  const app = getApp()
  const { escrow } = await openGig(app, { escrow: { requires_approval: true } })
  const worker = await createUser(app)
  await app.db.insert(gig_applications).values({ escrow_id: escrow.id, applicant_id: worker.row.id, expires_at: new Date(Date.now() + 24 * HOUR_MS) })
  const res = await withChainPaused(TEST_CHAIN_ID, () =>
    app.inject({ method: 'DELETE', url: `/v1/gigs/${escrow.id}/applications`, headers: authHeader(worker.token) }),
  )
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json(), { withdrawn: true })
})

// ── the listing ─────────────────────────────────────────────────────────────

test('pause: GET /v1/platform/chains omits a paused chain and lists it again once enabled; its escrows stay readable', { skip }, async () => {
  const app = getApp()
  await seedAltChain(app)
  const ids = async () => (await app.inject({ method: 'GET', url: apiRoutes.platform.chains })).json<{ data: { id: string }[] }>().data.map((c) => c.id)
  const before = await ids()
  assert.ok(before.includes(TEST_CHAIN_ID_ALT), 'precondition: the chain is listed')
  const during = await withChainPaused(TEST_CHAIN_ID_ALT, ids)
  assert.ok(!during.includes(TEST_CHAIN_ID_ALT), 'a paused chain must not be offered')
  assert.deepStrictEqual(during, before.filter((id) => id !== TEST_CHAIN_ID_ALT), 'only the paused chain left the list')
  assert.deepStrictEqual(await ids(), before)
  // An escrow ON a paused chain is still served: the pause refuses new work, not reads.
  const { escrow } = await openGig(app)
  const read = await withChainPaused(TEST_CHAIN_ID, () => app.inject({ method: 'GET', url: `/v1/gigs/${escrow.id}` }))
  assert.strictEqual(read.statusCode, 200)
})
