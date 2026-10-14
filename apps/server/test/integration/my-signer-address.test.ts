/**
 * `my_signer_address` on both detail wires — the viewer-relative bound
 * wallet. One field, owner-only BY SHAPE: the route computes it per viewer,
 * so the other party's address never rides the response at all. The
 * projection itself is unit-tested (escrow-detail-scope.test.ts); these
 * tests exist because dropping the route wiring — or wiring the wrong
 * viewer id — would pass every unit suite.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { escrows, user_wallets } from '@tenda/shared/db/schema'
import {
  TEST_DB_CONFIGURED,
  useTestApp,
  createTransactableUser,
  createUser,
  createEscrow,
  attachGigDetails,
  attachExchangeDetails,
  authHeader,
  testWalletAddress,
} from '../helpers/test-app'
import { createEscrowBody } from '../helpers/escrow-states'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const CREATOR_WALLET = 'CreatorWa11et1111111111111111111111111111'
const WORKER_WALLET = 'WorkerWa11et11111111111111111111111111111'
const ASSIGNEE_WALLET = 'AssigneeWa11et111111111111111111111111111'
// A syntactically fine address that belongs to NOBODY in the test DB.
const STRANGER_WALLET = 'StrangerWa11et1111111111111111111111111111'

test('gig detail: each party reads THEIR bound wallet; a stranger and anonymous read null', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const worker = await createUser(app)
  const stranger = await createUser(app)
  const e = await createEscrow(app, {
    creator_id: poster.row.id,
    counterparty_id: worker.row.id,
    status: 'accepted',
    creator_address: CREATOR_WALLET,
    counterparty_address: WORKER_WALLET,
  })
  await attachGigDetails(app, e.id, { title: 'Fix the roof' })

  const get = (token?: string) =>
    app.inject({
      method: 'GET',
      url: `/v1/gigs/${e.id}`,
      ...(token === undefined ? {} : { headers: authHeader(token) }),
    })

  assert.strictEqual((await get(poster.token)).json().my_signer_address, CREATOR_WALLET)
  assert.strictEqual((await get(worker.token)).json().my_signer_address, WORKER_WALLET)
  // Owner-only, structurally: the field carries the VIEWER's wallet or
  // nothing — there is no response in which A's wallet reaches B.
  assert.strictEqual((await get(stranger.token)).json().my_signer_address, null)
  assert.strictEqual((await get()).json().my_signer_address, null)
})

test('gig detail: a pre-accept assignee reads the wallet BAKED at create', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const assignee = await createUser(app)
  const e = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'open',
    assigned_counterparty_id: assignee.row.id,
    creator_address: CREATOR_WALLET,
    assigned_counterparty_address: ASSIGNEE_WALLET,
  })
  await attachGigDetails(app, e.id, { title: 'Fix the roof' })
  const res = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${e.id}`,
    headers: authHeader(assignee.token),
  })
  assert.strictEqual(res.json().my_signer_address, ASSIGNEE_WALLET)
})

test('gig detail: unstamped columns (drafts, pre-column escrows) answer null even to a party', { skip }, async () => {
  const app = getApp()
  const poster = await createUser(app)
  const e = await createEscrow(app, { creator_id: poster.row.id, status: 'open' })
  await attachGigDetails(app, e.id, { title: 'Fix the roof' })
  const res = await app.inject({
    method: 'GET',
    url: `/v1/gigs/${e.id}`,
    headers: authHeader(poster.token),
  })
  assert.strictEqual(res.json().my_signer_address, null)
})

test('exchange detail: the maker reads their create wallet; a signed-in non-party reads null', { skip }, async () => {
  const app = getApp()
  const maker = await createUser(app)
  const browser = await createUser(app)
  const e = await createEscrow(app, {
    creator_id: maker.row.id,
    status: 'open',
    kind: 'exchange',
    creator_address: CREATOR_WALLET,
  })
  await attachExchangeDetails(app, e.id)

  const get = (token: string) =>
    app.inject({ method: 'GET', url: `/v1/exchange/${e.id}`, headers: authHeader(token) })

  assert.strictEqual((await get(maker.token)).json().my_signer_address, CREATOR_WALLET)
  assert.strictEqual((await get(browser.token)).json().my_signer_address, null)
})

test('build-create RE-STAMPS the assignee wallet it is about to bake (record = bake)', { skip }, async () => {
  // The invariant on resolvePrimaryWalletAddress: every route that bakes an
  // assignee records what it baked. A draft republished after the assignee
  // changed wallets must not keep the stale stamp — on EVM no event ever
  // corrects it, so the row would name a wallet that cannot sign.
  const app = getApp()
  const poster = await createTransactableUser(app)
  const assignee = await createTransactableUser(app)
  const e = await createEscrow(app, {
    creator_id: poster.row.id,
    status: 'draft',
    assigned_counterparty_id: assignee.row.id,
    assigned_counterparty_address: 'StaleWa11et111111111111111111111111111111',
  })
  await attachGigDetails(app, e.id, { title: 'Fix the roof' })

  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/build-create`, headers: authHeader(poster.token),
  })
  assert.strictEqual(res.statusCode, 200)

  const [row] = await app.db
    .select({ assigned_counterparty_address: escrows.assigned_counterparty_address })
    .from(escrows)
    .where(eq(escrows.id, e.id))
    .limit(1)
  // What the builder bakes is the assignee's current primary — the record
  // must say the same, never the stale stamp.
  assert.strictEqual(row.assigned_counterparty_address, testWalletAddress(assignee.row.id))
})

test('POST /v1/escrows: a direct-assign draft RECORDS the assignee wallet it will bake', { skip }, async () => {
  const app = getApp()
  const poster = await createTransactableUser(app)
  const assignee = await createTransactableUser(app)
  const res = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(poster.token),
    payload: createEscrowBody({ assigned_counterparty_id: assignee.row.id }),
  })
  assert.strictEqual(res.statusCode, 201)
  const [row] = await app.db
    .select({ assigned_counterparty_address: escrows.assigned_counterparty_address })
    .from(escrows)
    .where(eq(escrows.id, res.json().escrow_id))
    .limit(1)
  assert.strictEqual(row.assigned_counterparty_address, testWalletAddress(assignee.row.id))
})

test('build-create: a declared signer that is not the caller’s wallet → 422 (same wiring as create)', { skip }, async () => {
  const app = getApp()
  const poster = await createTransactableUser(app)
  const e = await createEscrow(app, { creator_id: poster.row.id, status: 'draft' })
  await attachGigDetails(app, e.id, { title: 'Fix the roof' })
  const res = await app.inject({
    method: 'POST', url: `/v1/escrows/${e.id}/build-create`, headers: authHeader(poster.token),
    payload: { signer_address: STRANGER_WALLET },
  })
  assert.strictEqual(res.statusCode, 422)
  assert.strictEqual(res.json().code, 'ESCROW_WRONG_WALLET')
})

test('create REPLAY re-stamps the assignee wallet the rebuilt tx will bake', { skip }, async () => {
  // The idempotent retry path rebuilds the create tx (baking the assignee's
  // CURRENT primary) — the row must follow, or a retry after the assignee
  // changed wallets serves a stamp the rebuilt tx contradicts (B1's invariant
  // on its second entry path).
  const app = getApp()
  const poster = await createTransactableUser(app)
  const assignee = await createTransactableUser(app)
  const body = createEscrowBody({ assigned_counterparty_id: assignee.row.id })

  const first = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(poster.token), payload: body,
  })
  assert.strictEqual(first.statusCode, 201)
  const escrowId = first.json().escrow_id

  // The assignee's primary wallet changes between the attempts.
  await app.db
    .update(user_wallets)
    .set({ address: 'NewPrimaryWa11et1111111111111111111111111' })
    .where(eq(user_wallets.user_id, assignee.row.id))

  const replay = await app.inject({
    method: 'POST', url: '/v1/escrows', headers: authHeader(poster.token), payload: body,
  })
  assert.strictEqual(replay.statusCode, 200)
  assert.strictEqual(replay.json().escrow_id, escrowId)

  const [row] = await app.db
    .select({ assigned_counterparty_address: escrows.assigned_counterparty_address })
    .from(escrows)
    .where(eq(escrows.id, escrowId))
    .limit(1)
  assert.strictEqual(row.assigned_counterparty_address, 'NewPrimaryWa11et1111111111111111111111111')
})
