/**
 * GET /v1/users/:id/transactions — the PERSONAL feed.
 *
 * The bug this pins: the feed used to be "every row on every escrow you are a
 * party to", so a poster's wallet listed the worker's actions ("Gig accepted",
 * "Proof submitted") and vice versa. Visibility is now keyed by
 * (tx type × your role), per the shared TX_FEED_VISIBILITY matrix.
 *
 * `total` is asserted alongside the rows on purpose: it is computed by a
 * SECOND query, and it drives the client's `hasMore`. A filtered page over an
 * unfiltered count is exactly how paging would stall on a half-empty list.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escrow_transactions } from '@tenda/shared/db/schema'
import { feedTxTypesFor, type EscrowTxType, type UserEscrowTransaction } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createUser,
  createEscrow,
  authHeader,
  type TestUser,
} from '../helpers/test-app'
import type { FastifyInstance } from 'fastify'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

interface TxSpec {
  type: EscrowTxType
  /** Omit for "no actor could be resolved" (the NULL-actor arm). */
  actor?: TestUser
}

/** One escrow between `creator` and `worker`, carrying `specs` in order. */
async function escrowWith(
  app: FastifyInstance,
  creator: TestUser,
  worker: TestUser | null,
  specs: TxSpec[],
): Promise<string> {
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker?.row.id ?? null,
    status: 'completed',
    amount_raw: '1000000',
  })
  let i = 0
  for (const spec of specs) {
    await app.db.insert(escrow_transactions).values({
      escrow_id: escrow.id,
      type: spec.type,
      tx_ref: `${escrow.id}-${spec.type}-${i++}`,
      amount_raw: '1000000',
      actor_id: spec.actor?.row.id ?? null,
    })
  }
  return escrow.id
}

async function feed(
  app: FastifyInstance,
  user: TestUser,
  query = '',
): Promise<{ status: number; types: EscrowTxType[]; total: number; data: UserEscrowTransaction[] }> {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/users/${user.row.id}/transactions${query}`,
    headers: authHeader(user.token),
  })
  if (res.statusCode !== 200) return { status: res.statusCode, types: [], total: 0, data: [] }
  const body = res.json<{ data: UserEscrowTransaction[]; total: number }>()
  return {
    status: res.statusCode,
    types: body.data.map((t) => t.type),
    total: body.total,
    data: body.data,
  }
}

const sorted = (types: EscrowTxType[]): EscrowTxType[] => [...types].sort()

// ---------- the headline split ------------------------------------------

test('a full gig lifecycle splits into two role-correct feeds', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)

  // Every type that can legally appear on ONE escrow with both parties set.
  await escrowWith(app, poster, worker, [
    { type: 'create', actor: poster },
    { type: 'assign_accept', actor: poster },
    { type: 'submit', actor: worker },
    { type: 'approve', actor: poster },
  ])

  const posterFeed = await feed(app, poster)
  const workerFeed = await feed(app, worker)

  assert.deepEqual(sorted(posterFeed.types), sorted(['create', 'assign_accept', 'approve']))
  assert.deepEqual(sorted(workerFeed.types), sorted(['assign_accept', 'submit', 'approve']))

  // total is the FILTERED count, not the 4 rows on the escrow.
  assert.equal(posterFeed.total, 3)
  assert.equal(workerFeed.total, 3)
})

test("the worker's actions stay out of the poster's feed", { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  await escrowWith(app, poster, worker, [
    { type: 'accept', actor: worker },
    { type: 'submit', actor: worker },
    { type: 'claim_stalled', actor: worker },
  ])

  const posterFeed = await feed(app, poster)
  assert.deepEqual(posterFeed.types, [])
  assert.equal(posterFeed.total, 0)

  const workerFeed = await feed(app, worker)
  assert.deepEqual(sorted(workerFeed.types), sorted(['accept', 'submit', 'claim_stalled']))
})

test("the poster's actions stay out of the worker's feed", { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  await escrowWith(app, poster, worker, [
    { type: 'create', actor: poster },
    { type: 'unassign', actor: poster },
    { type: 'reclaim_abandoned', actor: poster },
  ])

  const workerFeed = await feed(app, worker)
  assert.deepEqual(workerFeed.types, [])
  assert.equal(workerFeed.total, 0)

  const posterFeed = await feed(app, poster)
  assert.deepEqual(sorted(posterFeed.types), sorted(['create', 'unassign', 'reclaim_abandoned']))
})

// ---------- the NULL-actor traps ----------------------------------------

test('resolve reaches BOTH parties despite carrying no actor', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  // DisputeResolved declares no actor_field, so actor_id is always NULL here.
  await escrowWith(app, poster, worker, [{ type: 'resolve' }])

  assert.deepEqual((await feed(app, poster)).types, ['resolve'])
  assert.deepEqual((await feed(app, worker)).types, ['resolve'])
})

test('submit reaches the worker even with a NULL actor (the EVM case)', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  // The EVM ProofSubmitted event carries no acting wallet, unlike Anchor's.
  await escrowWith(app, poster, worker, [{ type: 'submit' }])

  assert.deepEqual((await feed(app, worker)).types, ['submit'])
  assert.deepEqual((await feed(app, poster)).types, [])
})

// ---------- the actor-scoped type ---------------------------------------

test('dispute goes only to the party who raised it', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  await escrowWith(app, poster, worker, [{ type: 'dispute', actor: worker }])

  assert.deepEqual((await feed(app, worker)).types, ['dispute'])
  const posterFeed = await feed(app, poster)
  assert.deepEqual(posterFeed.types, [])
  assert.equal(posterFeed.total, 0)
})

test('a dispute raised by the poster goes only to the poster', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  await escrowWith(app, poster, worker, [{ type: 'dispute', actor: poster }])

  assert.deepEqual((await feed(app, poster)).types, ['dispute'])
  assert.deepEqual((await feed(app, worker)).types, [])
})

test('a dispute with an unresolvable actor falls back to BOTH parties', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  // Losing the row for everyone is the unrecoverable failure; showing it to
  // both is the recoverable one.
  await escrowWith(app, poster, worker, [{ type: 'dispute' }])

  assert.deepEqual((await feed(app, poster)).types, ['dispute'])
  assert.deepEqual((await feed(app, worker)).types, ['dispute'])
})

test('an actor who is a stranger to the escrow leaks nothing', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const stranger = await createUser(app)
  // actor_id matching is bounded by party membership, so a mis-resolved actor
  // cannot surface someone else's escrow in a third party's wallet.
  await escrowWith(app, poster, worker, [{ type: 'dispute', actor: stranger }])

  const strangerFeed = await feed(app, stranger)
  assert.deepEqual(strangerFeed.types, [])
  assert.equal(strangerFeed.total, 0)
})

// ---------- the hidden types --------------------------------------------

test('decline is visible to nobody — the decliner was never a party', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const invitee = await createUser(app)
  // A direct-offer decline: the invitee is assigned_counterparty_id, which the
  // decline patch clears, so counterparty_id is null throughout.
  await escrowWith(app, poster, null, [{ type: 'decline', actor: invitee }])

  assert.deepEqual((await feed(app, poster)).types, [])
  assert.deepEqual((await feed(app, invitee)).types, [])
})

test('a cancelled open escrow credits only the poster', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  await escrowWith(app, poster, null, [
    { type: 'create', actor: poster },
    { type: 'cancel', actor: poster },
  ])

  assert.deepEqual(sorted((await feed(app, poster)).types), sorted(['create', 'cancel']))
})

// ---------- pagination over the filtered set ----------------------------

test('limit/offset page over the FILTERED set, not the raw rows', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  // 3 escrows × (1 poster-visible + 1 worker-visible) = 3 visible per side.
  for (let i = 0; i < 3; i++) {
    await escrowWith(app, poster, worker, [
      { type: 'create', actor: poster },
      { type: 'submit', actor: worker },
    ])
  }

  const page0 = await feed(app, poster, '?limit=2&offset=0')
  assert.equal(page0.total, 3)
  assert.equal(page0.types.length, 2)
  assert.deepEqual(page0.types, ['create', 'create'])

  const page1 = await feed(app, poster, '?limit=2&offset=2')
  assert.equal(page1.total, 3)
  assert.equal(page1.types.length, 1)

  // No row appears on both pages.
  const page0Ids = new Set(page0.data.map((t) => t.id))
  assert.ok(page1.data.every((t) => !page0Ids.has(t.id)))
})

test('an empty feed reports total 0 rather than the escrow row count', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  await escrowWith(app, poster, worker, [{ type: 'accept', actor: worker }])

  const posterFeed = await feed(app, poster)
  assert.deepEqual(posterFeed.data, [])
  assert.equal(posterFeed.total, 0)
})

// ---------- authorisation ------------------------------------------------

test('reading another user\'s feed is forbidden', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const b = await createUser(app)
  const res = await app.inject({
    method: 'GET',
    url: `/v1/users/${b.row.id}/transactions`,
    headers: authHeader(a.token),
  })
  assert.equal(res.statusCode, 403)
})

test('reading the feed unauthenticated is rejected', { skip }, async () => {
  const app = getApp()
  const a = await createUser(app)
  const res = await app.inject({ method: 'GET', url: `/v1/users/${a.row.id}/transactions` })
  assert.equal(res.statusCode, 401)
})

// ---------- matrix ↔ route agreement -------------------------------------

/**
 * Drives EVERY always-visible type through the real route, so a matrix cell
 * that the SQL predicate cannot actually express (a typo'd column, a type the
 * enum rejects) fails here rather than in someone's wallet.
 */
test('every always-visible type reaches its role through the route', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)

  const creatorTypes = feedTxTypesFor('creator')
  const counterpartyTypes = feedTxTypesFor('counterparty')

  // One escrow per type keeps the (escrow, type) pairs independent — several
  // of these could never co-exist on a single escrow's real lifecycle.
  for (const type of new Set([...creatorTypes, ...counterpartyTypes])) {
    await escrowWith(app, poster, worker, [{ type }])
  }

  assert.deepEqual(sorted((await feed(app, poster)).types), sorted([...creatorTypes]))
  assert.deepEqual(sorted((await feed(app, worker)).types), sorted([...counterpartyTypes]))
})
