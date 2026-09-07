/**
 * POST /v1/escrows/:id/build-create (#80): publish path for owned drafts —
 * server-opened fiat-offramp offers (inserted with NO deadlines and no
 * unsigned tx) and signing-declined retries. A LIVE accept deadline is kept
 * (#41 — the agent's create nonce is signed over it); a lapsed or missing one
 * is redrawn from the draft's own window; buyer-visible terms never change.
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { assets, chains, escrows, tx_attempts } from '@tenda/shared/db/schema'
import { DEFAULT_ACCEPT_WINDOW_SECONDS } from '@tenda/shared'
import {
  TEST_DB_CONFIGURED,
  FAKE_UNSIGNED,
  useTestApp,
  createTransactableUser,
  createUser,
  createEscrow,
  attachExchangeDetails,
  authHeader,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

function url(id: string): string {
  return `/v1/escrows/${id}/build-create`
}

test('build-create: 404 unknown, 403 non-creator, 409 published', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const stranger = await createUser(app)

  const missing = await app.inject({
    method: 'POST',
    url: url('f0e36d8a-0000-0000-0000-000000000000'),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(missing.statusCode, 404)

  const draft = await createEscrow(app, { creator_id: creator.row.id })
  const foreign = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: authHeader(stranger.token),
  })
  assert.strictEqual(foreign.statusCode, 403)

  const open = await createEscrow(app, { creator_id: creator.row.id, status: 'open' })
  const published = await app.inject({
    method: 'POST',
    url: url(open.id),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(published.statusCode, 409)
})

test('build-create: profile-incomplete creator is gated like POST /v1/escrows', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app, { first_name: '' })
  const draft = await createEscrow(app, { creator_id: creator.row.id })
  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'PROFILE_INCOMPLETE')
})

test('build-create: 409 while a create ping is unsettled', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const draft = await createEscrow(app, { creator_id: creator.row.id })
  await app.db.insert(tx_attempts).values({
    user_id: creator.row.id,
    escrow_id: draft.id,
    action: 'create',
    tx_ref: `sig-pending-${draft.id}`,
  })
  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 409)
})

test('build-create: creator without a linked wallet → 403 WALLET_REQUIRED (9D gate)', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app) // no wallet, no verified contact
  const draft = await createEscrow(app, { creator_id: creator.row.id })
  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 403)
  assert.strictEqual(res.json().code, 'WALLET_REQUIRED')
})

test('build-create: fresh gig draft → 200, and a LIVE deadline is kept', { skip }, async () => {
  const app = getApp()
  const creator = await createTransactableUser(app) // 9D gate: wallet + verified contact
  // Stamped three days out, so it comfortably outlives a relay quote. It must
  // be KEPT: the agent one-shot signs a nonce over the create params, and
  // re-drawing the deadline between the 402 and the payment invalidates that
  // signature. Staleness is handled by the case below, not by redrawing always.
  const stamped = new Date(Date.now() + 3 * 86_400_000)
  const draft = await createEscrow(app, { creator_id: creator.row.id, accept_deadline: stamped })

  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().escrow_id, draft.id)
  assert.deepStrictEqual(res.json().unsigned, FAKE_UNSIGNED)

  const [row] = await app.db.select().from(escrows).where(eq(escrows.id, draft.id))
  assert.strictEqual(row.accept_deadline?.getTime(), stamped.getTime(), 'a live deadline is stable')
})

test('build-create: a second build that changes nothing does not touch the row', { skip }, async () => {
  // The agent one-shot lands here TWICE for one task — the 402 quote and the
  // X-PAYMENT resend — and neither is the user editing their listing. With the
  // deadline now stable across that pair (see above), nothing in the re-stamp
  // moves, so the row must not be written: `escrows.updated_at` auto-bumps on
  // any Drizzle update, and a quote is not an edit.
  const app = getApp()
  const creator = await createTransactableUser(app)
  const stamped = new Date(Date.now() + 3 * 86_400_000)
  const draft = await createEscrow(app, { creator_id: creator.row.id, accept_deadline: stamped })

  // The FIRST build legitimately writes: it stamps the contract address the
  // transaction is being built against, which a fresh draft has never held.
  const first = await app.inject({ method: 'POST', url: url(draft.id), headers: authHeader(creator.token) })
  assert.strictEqual(first.statusCode, 200)
  const [afterFirst] = await app.db.select().from(escrows).where(eq(escrows.id, draft.id))

  const second = await app.inject({ method: 'POST', url: url(draft.id), headers: authHeader(creator.token) })
  assert.strictEqual(second.statusCode, 200)
  const [afterSecond] = await app.db.select().from(escrows).where(eq(escrows.id, draft.id))

  assert.strictEqual(
    afterSecond.updated_at?.getTime(),
    afterFirst.updated_at?.getTime(),
    'the second build changed nothing, so it must not have written the row',
  )
  assert.strictEqual(afterSecond.accept_deadline?.getTime(), stamped.getTime())
})

test('build-create: a LAPSED deadline is redrawn from the window', { skip }, async () => {
  // The other half. A draft that sat past its own window would otherwise build
  // a create both programs reject, so this one IS re-derived.
  const app = getApp()
  const creator = await createTransactableUser(app)
  const lapsed = new Date(Date.now() - 60_000)
  const draft = await createEscrow(app, { creator_id: creator.row.id, accept_deadline: lapsed })

  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)

  const [row] = await app.db.select().from(escrows).where(eq(escrows.id, draft.id))
  const expected = Date.now() + row.accept_window_seconds * 1000
  assert.ok((row.accept_deadline?.getTime() ?? 0) > Date.now(), 'the redrawn deadline is in the future')
  assert.ok(
    Math.abs((row.accept_deadline?.getTime() ?? 0) - expected) < 10_000,
    'and it is now + the draft’s own window',
  )
  // Redrawing the LISTING window is not a change to the offer: pre-publish the
  // deadline is ours to restart, the buyer-visible terms are not.
  assert.strictEqual(row.amount_raw, draft.amount_raw)
})

test('build-create: a redrawn deadline is written even when nothing else moved', { skip }, async () => {
  // The guard above must not suppress the one write that matters. After a first
  // build the contract is stamped and the assignee resolved, so on a LATER build
  // the deadline can be the only thing that moved — and if that write is skipped,
  // the row keeps a lapsed instant while the transaction encodes a live one, which
  // is precisely the DB/chain disagreement the re-stamp exists to prevent.
  const app = getApp()
  const creator = await createTransactableUser(app)
  const draft = await createEscrow(app, { creator_id: creator.row.id })

  const first = await app.inject({ method: 'POST', url: url(draft.id), headers: authHeader(creator.token) })
  assert.strictEqual(first.statusCode, 200)

  // The draft then sits until its window runs out. Nothing else about it changes.
  const lapsed = new Date(Date.now() - 60_000)
  await app.db.update(escrows).set({ accept_deadline: lapsed }).where(eq(escrows.id, draft.id))

  const second = await app.inject({ method: 'POST', url: url(draft.id), headers: authHeader(creator.token) })
  assert.strictEqual(second.statusCode, 200)

  const [row] = await app.db.select().from(escrows).where(eq(escrows.id, draft.id))
  assert.notStrictEqual(row.accept_deadline?.getTime(), lapsed.getTime(), 'the lapsed instant was rewritten')
  assert.ok((row.accept_deadline?.getTime() ?? 0) > Date.now(), 'and the row now holds a live deadline')
})

test('build-create: offramp-shaped draft (no deadlines) gets backfilled from the offer', { skip }, async () => {
  const app = getApp()
  const creator = await createTransactableUser(app)
  // Exactly what drizzleP2pFulfilment used to insert: no accept_deadline,
  // no completion window — only the exchange_details satellite.
  const draft = await createEscrow(app, {
    creator_id: creator.row.id,
    kind: 'exchange',
    accept_deadline: null,
    completion_duration_seconds: null,
  })
  await attachExchangeDetails(app, draft.id)

  const before = Date.now()
  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.json().unsigned, FAKE_UNSIGNED)

  const [row] = await app.db.select().from(escrows).where(eq(escrows.id, draft.id))
  // completion window = the offer's fiat payment window (helper default 24h)
  assert.strictEqual(row.completion_duration_seconds, 86_400)
  // accept deadline = now + shared default window
  const expectedMin = before + DEFAULT_ACCEPT_WINDOW_SECONDS * 1000 - 5_000
  assert.ok((row.accept_deadline?.getTime() ?? 0) >= expectedMin)
})

test('build-create: gig draft without a completion window → 422', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  const draft = await createEscrow(app, {
    creator_id: creator.row.id,
    completion_duration_seconds: null,
  })
  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 422)
})

test('build-create: 503 when the draft chain is no longer registered', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  // A chain present in the DB but absent from the runtime registry
  // (e.g. BASE env removed after the draft was created).
  await app.db.insert(chains).values({
    id: 'solana:mainnet',
    namespace: 'solana',
    display_name: 'Solana Mainnet',
    min_confirmations: 1,
    treasury_address: 'treasury',
    escrow_program: 'program',
  })
  await app.db.insert(assets).values({
    id: 'USDC_SOL_MAINNET_TEST',
    chain_id: 'solana:mainnet',
    symbol: 'USDC',
    decimals: 6,
    token_address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    is_stable: true,
  })
  const draft = await createEscrow(app, {
    creator_id: creator.row.id,
    chain_id: 'solana:mainnet',
    asset: 'USDC_SOL_MAINNET_TEST',
  })

  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 503)
  assert.strictEqual(res.json().code, 'SERVICE_UNAVAILABLE')
})
