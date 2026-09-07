/**
 * POST /v1/escrows/:id/build-create (#80): publish path for owned drafts —
 * server-opened fiat-offramp offers (inserted with NO deadlines and no
 * unsigned tx) and signing-declined retries. Lapsed/missing accept
 * deadlines refresh; buyer-visible terms never change.
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
  createUser,
  createEscrow,
  attachExchangeDetails,
  authHeader,
  makeTransactable,
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

test('build-create: fresh gig draft → 200, deadlines untouched', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id) // 9D gate: wallet + verified contact
  const deadline = new Date(Date.now() + 3 * 86_400_000)
  const draft = await createEscrow(app, { creator_id: creator.row.id, accept_deadline: deadline })

  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().escrow_id, draft.id)
  assert.deepStrictEqual(res.json().unsigned, FAKE_UNSIGNED)

  const [row] = await app.db.select().from(escrows).where(eq(escrows.id, draft.id))
  assert.strictEqual(row.accept_deadline?.getTime(), deadline.getTime())
})

test('build-create: offramp-shaped draft (no deadlines) gets backfilled from the offer', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id)
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

test('build-create: lapsed accept deadline refreshes; terms stay put', { skip }, async () => {
  const app = getApp()
  const creator = await createUser(app)
  await makeTransactable(app, creator.row.id)
  const draft = await createEscrow(app, {
    creator_id: creator.row.id,
    accept_deadline: new Date(Date.now() - 60_000),
  })

  const res = await app.inject({
    method: 'POST',
    url: url(draft.id),
    headers: authHeader(creator.token),
  })
  assert.strictEqual(res.statusCode, 200)

  const [row] = await app.db.select().from(escrows).where(eq(escrows.id, draft.id))
  assert.ok((row.accept_deadline?.getTime() ?? 0) > Date.now())
  assert.strictEqual(row.amount_raw, draft.amount_raw) // terms untouched
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
