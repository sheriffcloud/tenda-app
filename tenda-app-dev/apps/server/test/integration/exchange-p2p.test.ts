/**
 * CO4 (#73): exchange offer creation + p2p onramp.
 *   POST /v1/exchange — attach offer terms to a draft (ownership/kind/
 *     status guards, numeric validation, draft-window upsert)
 *   POST /v1/fiat/quote|onramp — buyer quotes route to LIVE sell offers
 *     (no offer → no quote; own offers excluded; quote = offer terms;
 *     initiate hands back the matched offer id)
 *
 * Real app via fastify.inject; gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { escrows, exchange_details } from '@tenda/shared/db/schema'
import { EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS } from '@tenda/shared'
import { buildProviders } from '@server/features/fiat-rails'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  TEST_ASSET,
  TEST_NATIVE_ASSET,
  useTestApp,
  createTransactableUser,
  createUser,
  createEscrow,
  createBankAccount,
  attachExchangeDetails,
  authHeader,
  type TestUser,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** The live p2p provider over the harness DB (status-mapping tests). */
function p2pProvider(app: FastifyInstance) {
  const provider = buildProviders(app).get('p2p_internal')
  assert.ok(provider !== undefined)
  return provider
}

// ---------- POST /v1/exchange ---------------------------------------------------

function offerBody(escrow_id: string, overrides: Record<string, unknown> = {}) {
  return { escrow_id, fiat_amount: 15_000, fiat_currency: 'NGN', rate: 1_500, ...overrides }
}

/**
 * A validation rail answers 400 AND names its own field.
 *
 * The message half is not decoration (#97, #98). `offerBody` carries no
 * payout_account_id, so ANY request that gets past the rails falls through to
 * "payout_account_id is required" — which is also a 400. Asserting the status
 * alone therefore passes whether or not the rail fired, and that is MEASURED
 * rather than suspected. NINE cases call this helper, covering five of the
 * route's body guards. Eight mutations were run one at a time and each left
 * every other case in this file green: the currency guard disabled outright
 * (#97); five clauses deleted one by one (#98) — fiat_amount <= 0, rate <= 0,
 * the window minimum, and the two upper bounds; and (#100) the escrow_id guard
 * replaced by a fallback id, and the omitted-currency `?? ''` arm defaulted to
 * a valid code. The message is what ties a case to the rail it names.
 *
 * `offerBody` is deliberately NOT given a payout account instead. That would
 * make a validation request fail only for the reason it names, but it is called
 * directly by five other tests (eight sites) — one of which exists to prove
 * payout_account_id is REQUIRED, and would then have to delete the key the
 * fixture had just handed it.
 */
async function assertRail(
  post: (payload: Record<string, unknown>) => Promise<LightMyRequestResponse>,
  escrow_id: string,
  overrides: Record<string, unknown>,
  field: RegExp,
): Promise<void> {
  const res = await post(offerBody(escrow_id, overrides))
  assert.strictEqual(res.statusCode, 400)
  assert.match(res.json().message, field)
}

test('POST /v1/exchange: validation — amount, rate, currency, window', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: u.row.id, kind: 'exchange' })
  const post = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/v1/exchange', headers: authHeader(u.token), payload })

  await assertRail(post, escrow.id, { fiat_amount: -5 }, /fiat_amount/)
  await assertRail(post, escrow.id, { rate: 0 }, /^rate must be/)
  await assertRail(post, escrow.id, { fiat_currency: 'XXX' }, /fiat_currency/)
  await assertRail(post, escrow.id, { payment_window_seconds: 60 }, /payment_window_seconds/)
})

test('POST /v1/exchange: the body rails — a missing escrow_id and a missing currency', { skip }, async () => {
  // The two refusals #100 found with no test at all. Both are the FIRST thing
  // their value meets, so neither can be reached by the cases above:
  //   - escrow_id guards before any other field is read;
  //   - fiat_currency is `String(body.fiat_currency ?? '').toUpperCase()`, so an
  //     OMITTED currency takes the `?? ''` arm and lands on the same vocabulary
  //     refusal an unlisted code gets. That arm was untaken — every existing
  //     case sends a currency, valid or not.
  const app = getApp()
  const u = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: u.row.id, kind: 'exchange' })
  const post = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/v1/exchange', headers: authHeader(u.token), payload })

  // `undefined` is dropped by JSON serialisation, so the key is absent on the wire.
  await assertRail(post, escrow.id, { escrow_id: undefined }, /escrow_id is required/)
  await assertRail(post, escrow.id, { escrow_id: '' }, /escrow_id is required/)
  await assertRail(post, escrow.id, { fiat_currency: undefined }, /fiat_currency must be one of/)
})

test('POST /v1/exchange: 403 non-creator, 409 gig escrow, 409 published', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const stranger = await createUser(app)
  const exchange = await createEscrow(app, { creator_id: u.row.id, kind: 'exchange' })
  const gig = await createEscrow(app, { creator_id: u.row.id })
  const open = await createEscrow(app, { creator_id: u.row.id, kind: 'exchange', status: 'open' })

  const foreign = await app.inject({
    method: 'POST',
    url: '/v1/exchange',
    headers: authHeader(stranger.token),
    payload: offerBody(exchange.id),
  })
  assert.strictEqual(foreign.statusCode, 403)

  const wrongKind = await app.inject({
    method: 'POST',
    url: '/v1/exchange',
    headers: authHeader(u.token),
    payload: offerBody(gig.id),
  })
  assert.strictEqual(wrongKind.statusCode, 409)

  const published = await app.inject({
    method: 'POST',
    url: '/v1/exchange',
    headers: authHeader(u.token),
    payload: offerBody(open.id),
  })
  assert.strictEqual(published.statusCode, 409)
})

test('POST /v1/exchange: 201, and the draft upsert retries clean', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const account = await createBankAccount(app, u.row.id) // NG → NGN, matches the offer
  const escrow = await createEscrow(app, { creator_id: u.row.id, kind: 'exchange' })
  const first = await app.inject({
    method: 'POST',
    url: '/v1/exchange',
    headers: authHeader(u.token),
    payload: offerBody(escrow.id, { payout_account_id: account.id }),
  })
  assert.strictEqual(first.statusCode, 201)
  assert.strictEqual(first.json().fiat_currency, 'NGN')
  assert.strictEqual(first.json().payout_account_id, account.id)

  const retry = await app.inject({
    method: 'POST',
    url: '/v1/exchange',
    headers: authHeader(u.token),
    payload: offerBody(escrow.id, { rate: 1_550, payout_account_id: account.id }),
  })
  assert.strictEqual(retry.statusCode, 201)
  assert.strictEqual(retry.json().rate, '1550.0000000000')
})

// ---------- payout account (#5) -------------------------------------------------

test('POST /v1/exchange: payout_account_id is required (after the escrow guards)', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: u.row.id, kind: 'exchange' })
  const res = await app.inject({
    method: 'POST',
    url: '/v1/exchange',
    headers: authHeader(u.token),
    payload: offerBody(escrow.id), // no payout_account_id
  })
  assert.strictEqual(res.statusCode, 400)
  assert.match(res.json().message, /payout_account_id/i)
})

test('POST /v1/exchange: a foreign payout account is 404 (ownership enforced)', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const other = await createUser(app)
  const foreign = await createBankAccount(app, other.row.id)
  const escrow = await createEscrow(app, { creator_id: u.row.id, kind: 'exchange' })
  const res = await app.inject({
    method: 'POST',
    url: '/v1/exchange',
    headers: authHeader(u.token),
    payload: offerBody(escrow.id, { payout_account_id: foreign.id }),
  })
  assert.strictEqual(res.statusCode, 404)
})

test('POST /v1/exchange: a KES account cannot back an NGN offer (currency mismatch)', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const kenyan = await createBankAccount(app, u.row.id, { country: 'KE', bank_code: 'MPESA', kind: 'mobile_money' })
  const escrow = await createEscrow(app, { creator_id: u.row.id, kind: 'exchange' })
  const res = await app.inject({
    method: 'POST',
    url: '/v1/exchange',
    headers: authHeader(u.token),
    payload: offerBody(escrow.id, { fiat_currency: 'NGN', payout_account_id: kenyan.id }),
  })
  assert.strictEqual(res.statusCode, 400)
  assert.match(res.json().message, /currency/i)
})

// ---------- GET /v1/exchange/:id — payout account visibility (#5) ---------------

/** An accepted offer (visible to all) whose seller linked a payout account. */
async function acceptedOfferWithPayout(app: ReturnType<typeof getApp>, seller: TestUser, buyer: TestUser) {
  const account = await createBankAccount(app, seller.row.id, { account_number: '9988776655', account_name: 'SELLER PAYEE' })
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'accepted',
    counterparty_id: buyer.row.id,
  })
  await attachExchangeDetails(app, escrow.id, { payout_account_id: account.id })
  return escrow
}

test('GET /v1/exchange/:id: the accepted buyer sees the seller\'s FULL payout account', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const buyer = await createUser(app)
  const offer = await acceptedOfferWithPayout(app, seller, buyer)

  const res = await app.inject({ method: 'GET', url: `/v1/exchange/${offer.id}`, headers: authHeader(buyer.token) })
  assert.strictEqual(res.statusCode, 200)
  const payout = res.json().payout_account
  assert.ok(payout !== null)
  assert.strictEqual(payout.account_number, '9988776655') // FULL, not masked
  assert.strictEqual(payout.account_name, 'SELLER PAYEE')
})

test('GET /v1/exchange/:id: the seller sees their own payout account', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const buyer = await createUser(app)
  const offer = await acceptedOfferWithPayout(app, seller, buyer)

  const res = await app.inject({ method: 'GET', url: `/v1/exchange/${offer.id}`, headers: authHeader(seller.token) })
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.json().payout_account !== null)
})

test('GET /v1/exchange/:id: a stranger (non-party) never sees the payout account', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const buyer = await createUser(app)
  const stranger = await createUser(app)
  const offer = await acceptedOfferWithPayout(app, seller, buyer)

  const res = await app.inject({ method: 'GET', url: `/v1/exchange/${offer.id}`, headers: authHeader(stranger.token) })
  assert.strictEqual(res.statusCode, 200) // an accepted offer is publicly readable...
  assert.strictEqual(res.json().payout_account, null) // ...but the PII is not
})

test('GET /v1/exchange/:id: an offer with no linked account reports payout_account null', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const buyer = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id, kind: 'exchange', status: 'accepted', counterparty_id: buyer.row.id,
  })
  await attachExchangeDetails(app, escrow.id) // no payout_account_id

  const res = await app.inject({ method: 'GET', url: `/v1/exchange/${escrow.id}`, headers: authHeader(buyer.token) })
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.json().payout_account, null)
})

test('GET /v1/exchange/:id: is_seeker reflects the fee tier baked into the escrow', { skip }, async () => {
  const app = getApp()
  const seeker = await createUser(app)
  const regular = await createUser(app)

  const seekerOffer = await createEscrow(app, {
    creator_id: seeker.row.id, kind: 'exchange', status: 'open', is_seeker: true,
  })
  await attachExchangeDetails(app, seekerOffer.id)
  const regularOffer = await createEscrow(app, {
    creator_id: regular.row.id, kind: 'exchange', status: 'open',
  })
  await attachExchangeDetails(app, regularOffer.id)

  const seekerRes = await app.inject({ method: 'GET', url: `/v1/exchange/${seekerOffer.id}`, headers: authHeader(regular.token) })
  assert.strictEqual(seekerRes.statusCode, 200)
  assert.strictEqual(seekerRes.json().is_seeker, true)

  const regularRes = await app.inject({ method: 'GET', url: `/v1/exchange/${regularOffer.id}`, headers: authHeader(regular.token) })
  assert.strictEqual(regularRes.statusCode, 200)
  assert.strictEqual(regularRes.json().is_seeker, false)
})

// ---------- p2p onramp ------------------------------------------------------------

interface OfferSpec {
  fiat?: number
  currency?: string
  asset?: string
  amount_raw?: string
  rate?: string
}

/** Live sell offer — defaults to 6.5 SOL_DEVNET for 10,000 NGN. */
async function liveSellOffer(app: ReturnType<typeof getApp>, seller: TestUser, spec: OfferSpec = {}) {
  const escrow = await createEscrow(app, {
    creator_id: seller.row.id,
    kind: 'exchange',
    status: 'open',
    asset: spec.asset ?? TEST_NATIVE_ASSET,
    amount_raw: spec.amount_raw ?? '6500000000',
  })
  await attachExchangeDetails(app, escrow.id, {
    fiat_amount: (spec.fiat ?? 10_000).toFixed(4),
    fiat_currency: spec.currency ?? 'NGN',
    rate: spec.rate ?? '1538.4600000000',
  })
  return escrow
}

function quoteBody(fiat_amount: number, over: Partial<ReturnType<typeof baseQuote>> = {}) {
  return { ...baseQuote(fiat_amount), ...over }
}

function baseQuote(fiat_amount: number) {
  return {
    direction: 'onramp' as const,
    fiat_currency: 'NGN',
    fiat_amount,
    asset: TEST_NATIVE_ASSET,
    chain_id: TEST_CHAIN_ID,
    wallet_address: 'BuyerWallet1111111111111111111111111111111',
  }
}

test('p2p onramp: no live offers → 503 PROVIDER_UNAVAILABLE', { skip }, async () => {
  const app = getApp()
  const buyer = await createUser(app)
  const res = await app.inject({
    method: 'POST',
    url: '/v1/fiat/quote',
    headers: authHeader(buyer.token),
    payload: quoteBody(10_000),
  })
  assert.strictEqual(res.statusCode, 503)
})

test('p2p onramp: own offers and out-of-tolerance sizes never match', { skip }, async () => {
  const app = getApp()
  const buyer = await createUser(app)
  // own offer — exact size, still excluded
  await liveSellOffer(app, buyer, { fiat: 10_000 })
  const own = await app.inject({
    method: 'POST',
    url: '/v1/fiat/quote',
    headers: authHeader(buyer.token),
    payload: quoteBody(10_000),
  })
  assert.strictEqual(own.statusCode, 503)

  // someone else's offer but 3x the requested size — outside ±10%
  const seller = await createUser(app)
  await liveSellOffer(app, seller, { fiat: 30_000 })
  const oversized = await app.inject({
    method: 'POST',
    url: '/v1/fiat/quote',
    headers: authHeader(buyer.token),
    payload: quoteBody(10_000),
  })
  assert.strictEqual(oversized.statusCode, 503)
})

test('p2p onramp: quote mirrors the offer; initiate hands back its id', { skip }, async () => {
  const app = getApp()
  const buyer = await createUser(app)
  const seller = await createUser(app)
  const offer = await liveSellOffer(app, seller, { fiat: 10_000 })

  const quoted = await app.inject({
    method: 'POST',
    url: '/v1/fiat/quote',
    headers: authHeader(buyer.token),
    payload: quoteBody(9_800), // within ±10% of the 10,000 offer
  })
  assert.strictEqual(quoted.statusCode, 200)
  const quote = quoted.json()
  assert.strictEqual(quote.provider, 'p2p_internal')
  assert.strictEqual(quote.fiat_amount, 10_000) // the OFFER's exact terms
  assert.strictEqual(quote.asset_amount_raw, '6500000000')

  const initiated = await app.inject({
    method: 'POST',
    url: '/v1/fiat/onramp',
    headers: authHeader(buyer.token),
    payload: { intent_id: quote.intent_id },
  })
  assert.strictEqual(initiated.statusCode, 200)
  assert.deepStrictEqual(initiated.json().instruction, { kind: 'p2p', offer_id: offer.id })
})

test('p2p onramp: matched offer taken before initiate → 503', { skip }, async () => {
  const app = getApp()
  const buyer = await createUser(app)
  const seller = await createUser(app)
  const rival = await createUser(app)
  const offer = await liveSellOffer(app, seller, { fiat: 10_000 })

  const quoted = await app.inject({
    method: 'POST',
    url: '/v1/fiat/quote',
    headers: authHeader(buyer.token),
    payload: quoteBody(10_000),
  })
  assert.strictEqual(quoted.statusCode, 200)

  // a rival accepts the offer first (status leaves 'open')
  await app.db
    .update(escrows)
    .set({ status: 'accepted', counterparty_id: rival.row.id })
    .where(eq(escrows.id, offer.id))

  const initiated = await app.inject({
    method: 'POST',
    url: '/v1/fiat/onramp',
    headers: authHeader(buyer.token),
    payload: { intent_id: quoted.json().intent_id },
  })
  assert.strictEqual(initiated.statusCode, 503)
})

test('p2p status: an onramp intent only completes with ITS buyer', { skip }, async () => {
  const app = getApp()
  const provider = p2pProvider(app)

  const buyer = await createUser(app)
  const rival = await createUser(app)
  const seller = await createUser(app)
  const offer = await liveSellOffer(app, seller, { fiat: 10_000 })
  const asBuyer = { user_id: buyer.row.id, direction: 'onramp' as const }

  // live and unclaimed → still pending
  assert.strictEqual(await provider.status(offer.id, asBuyer), 'pending')

  // the RIVAL accepts → this buyer's match is gone
  await app.db
    .update(escrows)
    .set({ status: 'accepted', counterparty_id: rival.row.id })
    .where(eq(escrows.id, offer.id))
  assert.strictEqual(await provider.status(offer.id, asBuyer), 'failed')

  // ...and the rival completing it must NOT settle this buyer's intent
  await app.db.update(escrows).set({ status: 'completed' }).where(eq(escrows.id, offer.id))
  assert.strictEqual(await provider.status(offer.id, asBuyer), 'failed')
  // while the offramp view (the seller's own intent) correctly completes
  assert.strictEqual(
    await provider.status(offer.id, { user_id: seller.row.id, direction: 'offramp' }),
    'completed',
  )

  // a fresh offer accepted by THIS buyer stays pending, then completes
  const mine = await liveSellOffer(app, seller, { fiat: 10_000 })
  await app.db
    .update(escrows)
    .set({ status: 'accepted', counterparty_id: buyer.row.id })
    .where(eq(escrows.id, mine.id))
  assert.strictEqual(await provider.status(mine.id, asBuyer), 'pending')
  await app.db.update(escrows).set({ status: 'completed' }).where(eq(escrows.id, mine.id))
  assert.strictEqual(await provider.status(mine.id, asBuyer), 'completed')
})

test('p2p status: a dead open offer fails the onramp intent (hidden / lapsed)', { skip }, async () => {
  const app = getApp()
  const provider = p2pProvider(app)

  const buyer = await createUser(app)
  const seller = await createUser(app)
  const asBuyer = { user_id: buyer.row.id, direction: 'onramp' as const }

  const hiddenOffer = await liveSellOffer(app, seller, { fiat: 10_000 })
  await app.db.update(escrows).set({ hidden: true }).where(eq(escrows.id, hiddenOffer.id))
  assert.strictEqual(await provider.status(hiddenOffer.id, asBuyer), 'failed')

  const cancelled = await liveSellOffer(app, seller, { fiat: 10_000 })
  await app.db.update(escrows).set({ status: 'cancelled' }).where(eq(escrows.id, cancelled.id))
  assert.strictEqual(await provider.status(cancelled.id, asBuyer), 'failed')
})

// ---------- multi-asset / multi-currency (all supported exchange assets) ------

test('p2p onramp: matches an offer across assets AND launch currencies', { skip }, async () => {
  const app = getApp()
  const buyer = await createUser(app)
  const seller = await createUser(app)

  // A stablecoin offer priced in KES...
  await liveSellOffer(app, seller, {
    asset: TEST_ASSET, // USDC_SOL (6 dp)
    amount_raw: '2000000', // 2 USDC
    currency: 'KES',
    fiat: 5_000,
    rate: '2500.0000000000',
  })
  const usdcKes = await app.inject({
    method: 'POST',
    url: '/v1/fiat/quote',
    headers: authHeader(buyer.token),
    payload: quoteBody(5_000, { asset: TEST_ASSET, fiat_currency: 'KES' }),
  })
  assert.strictEqual(usdcKes.statusCode, 200)
  assert.strictEqual(usdcKes.json().fiat_amount, 5_000)
  assert.strictEqual(usdcKes.json().asset_amount_raw, '2000000')

  // ...and a native-asset offer priced in GHS, matched independently.
  await liveSellOffer(app, seller, {
    asset: TEST_NATIVE_ASSET, // SOL_DEVNET (9 dp)
    amount_raw: '1000000000', // 1 SOL
    currency: 'GHS',
    fiat: 2_500,
    rate: '2500.0000000000',
  })
  const solGhs = await app.inject({
    method: 'POST',
    url: '/v1/fiat/quote',
    headers: authHeader(buyer.token),
    payload: quoteBody(2_500, { asset: TEST_NATIVE_ASSET, fiat_currency: 'GHS' }),
  })
  assert.strictEqual(solGhs.statusCode, 200)
  assert.strictEqual(solGhs.json().fiat_amount, 2_500)
  assert.strictEqual(solGhs.json().asset_amount_raw, '1000000000')
})

test('p2p onramp: the asset AND the currency must both match the offer', { skip }, async () => {
  const app = getApp()
  const buyer = await createUser(app)
  const seller = await createUser(app)
  // The only live offer: USDC priced in NGN.
  await liveSellOffer(app, seller, { asset: TEST_ASSET, currency: 'NGN', fiat: 10_000 })

  // Right asset, wrong currency → no match.
  const wrongCurrency = await app.inject({
    method: 'POST',
    url: '/v1/fiat/quote',
    headers: authHeader(buyer.token),
    payload: quoteBody(10_000, { asset: TEST_ASSET, fiat_currency: 'KES' }),
  })
  assert.strictEqual(wrongCurrency.statusCode, 503)

  // Right currency, wrong asset → no match.
  const wrongAsset = await app.inject({
    method: 'POST',
    url: '/v1/fiat/quote',
    headers: authHeader(buyer.token),
    payload: quoteBody(10_000, { asset: TEST_NATIVE_ASSET, fiat_currency: 'NGN' }),
  })
  assert.strictEqual(wrongAsset.statusCode, 503)
})

test('p2p offramp: opens a draft for any asset/currency, exact precision + registry chain', { skip }, async () => {
  const app = getApp()
  const provider = p2pProvider(app)
  const seller = await createUser(app)

  const cases = [
    { asset: TEST_ASSET, amount_raw: '1500000', currency: 'KES', fiat: 3_750, rate: 2_500 }, // 1.5 USDC (6 dp)
    { asset: TEST_NATIVE_ASSET, amount_raw: '6500000000', currency: 'GHS', fiat: 16_250, rate: 2_500 }, // 6.5 SOL (9 dp)
  ]

  for (const c of cases) {
    const { instruction } = await provider.initiate({
      quote_ref: `q-${c.asset}`,
      user_id: seller.row.id,
      wallet_address: 'SellerWallet111111111111111111111111111111',
      direction: 'offramp',
      quote: {
        fiat_currency: c.currency,
        fiat_amount: c.fiat,
        asset: c.asset,
        asset_amount_raw: c.amount_raw,
        rate: c.rate,
      },
    })
    assert.ok('kind' in instruction && instruction.kind === 'p2p')
    const offer_id = (instruction as { kind: 'p2p'; offer_id: string }).offer_id

    const [row] = await app.db.select().from(escrows).where(eq(escrows.id, offer_id))
    assert.strictEqual(row.asset, c.asset)
    assert.strictEqual(row.chain_id, TEST_CHAIN_ID) // resolved from the asset registry
    assert.strictEqual(row.amount_raw, c.amount_raw) // base units survive verbatim
    assert.strictEqual(row.status, 'draft')

    const [details] = await app.db
      .select()
      .from(exchange_details)
      .where(eq(exchange_details.escrow_id, offer_id))
    assert.strictEqual(details.fiat_currency, c.currency)
    assert.strictEqual(Number(details.fiat_amount), c.fiat)
  }
})

test('offramp quote: prices any exchange asset in any launch currency (rate-sourced)', { skip }, async () => {
  const app = getApp()
  const buyer = await createUser(app)

  // Deterministic CoinGecko: usd-coin ~ stable per fiat, solana volatile.
  // (invalidateExchangeRatesCache in resetDb guarantees this stub is hit.)
  const realFetch = global.fetch
  global.fetch = (async () =>
    new Response(
      JSON.stringify({
        'usd-coin': { ngn: 1600, kes: 129, ghs: 15 },
        solana: { ngn: 300_000, kes: 25_000, ghs: 2_500 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch

  // mid × (1 − 1% spread) × display, floored to cents.
  const cases = [
    { asset: TEST_ASSET, amount_raw: '2000000', currency: 'NGN', expect: 3168 }, // 2 USDC × 1584
    { asset: TEST_NATIVE_ASSET, amount_raw: '1000000000', currency: 'KES', expect: 24750 }, // 1 SOL × 24750
    { asset: TEST_ASSET, amount_raw: '5000000', currency: 'GHS', expect: 74.25 }, // 5 USDC × 14.85
  ]
  try {
    for (const c of cases) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/fiat/quote',
        headers: authHeader(buyer.token),
        payload: {
          direction: 'offramp',
          fiat_currency: c.currency,
          asset: c.asset,
          asset_amount_raw: c.amount_raw,
          chain_id: TEST_CHAIN_ID,
          wallet_address: 'SellerWallet111111111111111111111111111111',
        },
      })
      assert.strictEqual(res.statusCode, 200, `${c.asset}/${c.currency}`)
      const q = res.json()
      assert.strictEqual(q.provider, 'p2p_internal')
      assert.strictEqual(q.fiat_amount, c.expect)
      assert.strictEqual(q.asset_amount_raw, c.amount_raw)
    }
  } finally {
    global.fetch = realFetch
  }
})

test('offramp quote: an in-precision amount whose fiat overflows the max is 422, not a 500', { skip }, async () => {
  const app = getApp()
  const buyer = await createUser(app)

  const realFetch = global.fetch
  global.fetch = (async () =>
    new Response(JSON.stringify({ 'usd-coin': { ngn: 1600 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
  try {
    // 7e8 USDC × 1584 ≈ 1.11e12 > EXCHANGE_MAX_FIAT_AMOUNT (1e12), yet the raw
    // amount is well within numeric(78,0) — the T15 bound must catch it.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/fiat/quote',
      headers: authHeader(buyer.token),
      payload: {
        direction: 'offramp',
        fiat_currency: 'NGN',
        asset: TEST_ASSET,
        asset_amount_raw: '700000000000000', // 7e8 USDC (6 dp)
        chain_id: TEST_CHAIN_ID,
        wallet_address: 'SellerWallet111111111111111111111111111111',
      },
    })
    assert.strictEqual(res.statusCode, 422)
  } finally {
    global.fetch = realFetch
  }
})

// ---------- advanced-mode gate + new-offer deadline stamping ------------------

test('PATCH /users/me: advanced_mode_enabled toggles on and off; non-boolean 422', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)

  const on = await app.inject({
    method: 'PATCH',
    url: '/v1/users/me',
    headers: authHeader(u.token),
    payload: { advanced_mode_enabled: true },
  })
  assert.strictEqual(on.statusCode, 200)
  assert.strictEqual(on.json().user.advanced_mode_enabled, true)

  const off = await app.inject({
    method: 'PATCH',
    url: '/v1/users/me',
    headers: authHeader(u.token),
    payload: { advanced_mode_enabled: false },
  })
  assert.strictEqual(off.json().user.advanced_mode_enabled, false)

  const bad = await app.inject({
    method: 'PATCH',
    url: '/v1/users/me',
    headers: authHeader(u.token),
    payload: { advanced_mode_enabled: 'yes' },
  })
  assert.strictEqual(bad.statusCode, 422)
})

test('p2p offramp: server-opened offers are publishable as-is (deadlines stamped)', { skip }, async () => {
  const app = getApp()
  const seller = await createTransactableUser(app) // publish clears the 9D first-transaction gate
  const provider = p2pProvider(app)

  const before = Date.now()
  const { instruction } = await provider.initiate({
    quote_ref: 'q-offramp',
    user_id: seller.row.id,
    wallet_address: 'SellerWallet111111111111111111111111111111',
    direction: 'offramp',
    quote: {
      fiat_currency: 'NGN',
      fiat_amount: 10_000,
      asset: TEST_NATIVE_ASSET,
      asset_amount_raw: '6500000000',
      rate: 1538.46,
    },
  })
  assert.ok('kind' in instruction && instruction.kind === 'p2p')
  const offer_id = (instruction as { kind: 'p2p'; offer_id: string }).offer_id

  const [row] = await app.db.select().from(escrows).where(eq(escrows.id, offer_id))
  assert.strictEqual(row.status, 'draft')
  assert.strictEqual(row.completion_duration_seconds, EXCHANGE_PAYMENT_WINDOW_DEFAULT_SECONDS) // payment window (12h)
  assert.ok((row.accept_deadline?.getTime() ?? 0) > before) // stamped, future

  // ...and build-create accepts it without needing the backfill path
  const published = await app.inject({
    method: 'POST',
    url: `/v1/escrows/${offer_id}/build-create`,
    headers: authHeader(seller.token),
  })
  assert.strictEqual(published.statusCode, 200)
})

test('p2p offramp: initiate persists the seller\'s payout account on the new offer', { skip }, async () => {
  const app = getApp()
  const provider = p2pProvider(app)
  const seller = await createUser(app)
  const account = await createBankAccount(app, seller.row.id, { account_number: '5551234567' })

  const { instruction } = await provider.initiate({
    quote_ref: 'q-offramp-payout',
    user_id: seller.row.id,
    wallet_address: 'SellerWallet111111111111111111111111111111',
    direction: 'offramp',
    quote: {
      fiat_currency: 'NGN', fiat_amount: 10_000, asset: TEST_NATIVE_ASSET,
      asset_amount_raw: '6500000000', rate: 1538.46,
    },
    payout_account_id: account.id,
  })
  assert.ok('kind' in instruction && instruction.kind === 'p2p')
  const offer_id = (instruction as { kind: 'p2p'; offer_id: string }).offer_id

  const [details] = await app.db
    .select()
    .from(exchange_details)
    .where(eq(exchange_details.escrow_id, offer_id))
  assert.strictEqual(details.payout_account_id, account.id)
})

// POST /v1/fiat/offramp binds the payout account to the offer the buyer pays
// into, so the account's currency must match the intent it was quoted in. Guard
// mirrors the manual create route (routes/v1/exchange).
async function quoteOfframpNgn(app: ReturnType<typeof getApp>, token: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/fiat/quote',
    headers: authHeader(token),
    payload: {
      direction: 'offramp',
      fiat_currency: 'NGN',
      asset: TEST_ASSET,
      asset_amount_raw: '2000000', // 2 USDC
      chain_id: TEST_CHAIN_ID,
      wallet_address: 'SellerWallet111111111111111111111111111111',
    },
  })
  assert.strictEqual(res.statusCode, 200)
  return res.json().intent_id
}

test('POST /v1/fiat/offramp: a mismatched-currency payout account is rejected (422), no offer opened', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const kenyan = await createBankAccount(app, seller.row.id, {
    country: 'KE', bank_code: 'MPESA', kind: 'mobile_money', account_number: '254700000000',
  })

  const realFetch = global.fetch
  global.fetch = (async () =>
    new Response(JSON.stringify({ 'usd-coin': { ngn: 1600 } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })) as typeof fetch
  try {
    const intent_id = await quoteOfframpNgn(app, seller.token)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/fiat/offramp',
      headers: authHeader(seller.token),
      payload: { intent_id, bank_account_id: kenyan.id },
    })
    assert.strictEqual(res.statusCode, 422)
    assert.match(res.json().message, /currency does not match/i)
  } finally {
    global.fetch = realFetch
  }

  // The guard fires BEFORE initiate, so no draft offer leaks out.
  const drafts = await app.db
    .select({ id: escrows.id })
    .from(escrows)
    .where(and(eq(escrows.creator_id, seller.row.id), eq(escrows.kind, 'exchange')))
  assert.strictEqual(drafts.length, 0)
})

test('POST /v1/fiat/offramp: a matching-currency account opens the offer with the account bound', { skip }, async () => {
  const app = getApp()
  const seller = await createUser(app)
  const nigerian = await createBankAccount(app, seller.row.id, { account_number: '0123456789' }) // NG → NGN

  const realFetch = global.fetch
  global.fetch = (async () =>
    new Response(JSON.stringify({ 'usd-coin': { ngn: 1600 } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })) as typeof fetch
  try {
    const intent_id = await quoteOfframpNgn(app, seller.token)

    const res = await app.inject({
      method: 'POST',
      url: '/v1/fiat/offramp',
      headers: authHeader(seller.token),
      payload: { intent_id, bank_account_id: nigerian.id },
    })
    assert.strictEqual(res.statusCode, 200)
    const inst = res.json().instruction
    assert.ok('kind' in inst && inst.kind === 'p2p')

    const [details] = await app.db
      .select()
      .from(exchange_details)
      .where(eq(exchange_details.escrow_id, inst.offer_id))
    assert.strictEqual(details.payout_account_id, nigerian.id)
  } finally {
    global.fetch = realFetch
  }
})

test('POST /v1/exchange: absurd terms hit the validation rails, not the driver', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app)
  const escrow = await createEscrow(app, { creator_id: u.row.id, kind: 'exchange' })
  const post = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/v1/exchange', headers: authHeader(u.token), payload })

  // The UPPER rails, the same shape as the lower ones above and just as unable
  // to speak for themselves on status alone.
  await assertRail(post, escrow.id, { fiat_amount: 1e18 }, /fiat_amount/)
  await assertRail(post, escrow.id, { rate: 1e12 }, /^rate must be/)
})
