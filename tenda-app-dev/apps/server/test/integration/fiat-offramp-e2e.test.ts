/**
 * Fiat offramp HAPPY PATH end-to-end (HTTP): proves the Redis quote-cache model
 * through the real routes + DB.
 *   POST /v1/fiat/quote   → quote is CACHED (no fiat_intents row yet)
 *   POST /v1/fiat/offramp → the quote is PROMOTED into an awaiting_user row
 *                           (reusing the same id) + a p2p offer instruction
 *   GET  /v1/fiat/intents/:id → reflects the committed intent
 * Negatives: a second offramp on the consumed quote → 409; a payout account
 * whose currency ≠ the quote's → 422 (the payout_country guard wiring); and
 * from #105 T1, a bank account the caller does not own → 404, and another
 * user's committed intent → 404 rather than 403.
 *
 * The only stub is CoinGecko (p2p mid-rate) — parsed generically from the URL,
 * so no asset/currency ids are hardcoded. Everything else is the real path.
 * DB-backed; gated on TEST_DATABASE_URL.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { eq } from 'drizzle-orm'
import { P2P_PROVIDER_ID } from '@tenda/shared'
import { fiat_providers, fiat_intents } from '@tenda/shared/db/schema/fiat'
import { invalidateExchangeRatesCache } from '@server/lib/exchange-rates'
import {
  TEST_DB_CONFIGURED,
  TEST_CHAIN_ID,
  TEST_ASSET,
  useTestApp,
  createUser,
  createBankAccount,
  authHeader,
} from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const WALLET = 'SellerWallet111111111111111111111111111111'
const MID_RATE = 1500 // NGN per USDC; offramp applies a -100bps spread → 1485

/** Stub global fetch to answer any CoinGecko price query at MID_RATE. */
function stubCoinGecko(): () => void {
  const real = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const u = new URL(href)
    const id = u.searchParams.get('ids') ?? ''
    const vs = (u.searchParams.get('vs_currencies') ?? '').split(',').filter(Boolean)
    const coin: Record<string, number> = {}
    for (const key of vs) coin[key] = MID_RATE
    return new Response(JSON.stringify({ [id]: coin }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  invalidateExchangeRatesCache() // ensure the stub is hit, not a warm entry
  return () => {
    globalThis.fetch = real
    invalidateExchangeRatesCache()
  }
}

async function seedProvider(app: ReturnType<typeof getApp>): Promise<void> {
  // fiat_intents.provider FKs fiat_providers, so the p2p row must exist before
  // an intent can be committed with provider='p2p_internal'. The seed may
  // already carry it (idempotent), so tolerate a pre-existing row.
  await app.db
    .insert(fiat_providers)
    .values({
      id: P2P_PROVIDER_ID,
      display_name: 'Internal P2P',
      capabilities: { onramp: true, offramp: true, currencies: ['NGN'], assets: ['*'] },
      priority: 100,
      is_enabled: true,
    })
    .onConflictDoNothing()
}

async function quoteOfframp(app: ReturnType<typeof getApp>, token: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/fiat/quote',
    headers: authHeader(token),
    payload: {
      direction: 'offramp',
      fiat_currency: 'NGN',
      asset: TEST_ASSET,
      chain_id: TEST_CHAIN_ID,
      wallet_address: WALLET,
      asset_amount_raw: '10000000', // 10 USDC (6dp) → ~14,850 NGN
    },
  })
}

test('offramp e2e: quote cached → offramp promotes to awaiting_user → GET reflects it', { skip }, async () => {
  const app = getApp()
  const restore = stubCoinGecko()
  try {
    await seedProvider(app)
    const u = await createUser(app, { country: 'NG' })
    const account = await createBankAccount(app, u.row.id, { country: 'NG' })

    // 1) Quote — cached, NOT persisted.
    const q = await quoteOfframp(app, u.token)
    assert.strictEqual(q.statusCode, 200, q.body)
    const intentId = q.json().intent_id as string
    assert.ok(intentId)
    const afterQuote = await app.db.select().from(fiat_intents).where(eq(fiat_intents.id, intentId))
    assert.strictEqual(afterQuote.length, 0, 'quote must not create a fiat_intents row')

    // 2) Offramp — promotes the cached quote into a durable awaiting_user row.
    const off = await app.inject({
      method: 'POST',
      url: '/v1/fiat/offramp',
      headers: authHeader(u.token),
      payload: { intent_id: intentId, bank_account_id: account.id },
    })
    assert.strictEqual(off.statusCode, 200, off.body)
    assert.strictEqual(off.json().status, 'awaiting_user')
    assert.strictEqual(off.json().instruction.kind, 'p2p')

    const [row] = await app.db.select().from(fiat_intents).where(eq(fiat_intents.id, intentId))
    assert.ok(row, 'offramp must create the committed row under the SAME id')
    assert.strictEqual(row.status, 'awaiting_user')
    assert.strictEqual(row.provider, P2P_PROVIDER_ID)
    assert.strictEqual(row.fiat_currency, 'NGN')

    // 3) GET reflects the committed intent.
    const get = await app.inject({
      method: 'GET',
      url: `/v1/fiat/intents/${intentId}`,
      headers: authHeader(u.token),
    })
    assert.strictEqual(get.statusCode, 200, get.body)
    assert.strictEqual(get.json().status, 'awaiting_user')
    assert.strictEqual(get.json().fiat_currency, 'NGN')

    // 4) Re-offramp the consumed quote → already-initiated 409 (no duplicate row).
    const again = await app.inject({
      method: 'POST',
      url: '/v1/fiat/offramp',
      headers: authHeader(u.token),
      payload: { intent_id: intentId, bank_account_id: account.id },
    })
    assert.strictEqual(again.statusCode, 409, again.body)
  } finally {
    restore()
  }
})

test('offramp e2e: a payout account whose currency ≠ the quote is rejected 422', { skip }, async () => {
  const app = getApp()
  const restore = stubCoinGecko()
  try {
    await seedProvider(app)
    const u = await createUser(app, { country: 'NG' })
    // KE account → KES, but the quote is NGN.
    const keAccount = await createBankAccount(app, u.row.id, { country: 'KE' })

    const q = await quoteOfframp(app, u.token)
    assert.strictEqual(q.statusCode, 200, q.body)
    const intentId = q.json().intent_id as string

    const off = await app.inject({
      method: 'POST',
      url: '/v1/fiat/offramp',
      headers: authHeader(u.token),
      payload: { intent_id: intentId, bank_account_id: keAccount.id },
    })
    assert.strictEqual(off.statusCode, 422, off.body)
    assert.match(off.json().message, /currency/)

    // The failed currency guard must NOT have burned the quote — a matching
    // account still succeeds against the same intent_id.
    const ng = await createBankAccount(app, u.row.id, { country: 'NG', account_number: '2222222222' })
    const ok = await app.inject({
      method: 'POST',
      url: '/v1/fiat/offramp',
      headers: authHeader(u.token),
      payload: { intent_id: intentId, bank_account_id: ng.id },
    })
    assert.strictEqual(ok.statusCode, 200, ok.body)
    assert.strictEqual(ok.json().status, 'awaiting_user')
  } finally {
    restore()
  }
})

test('POST /v1/fiat/offramp: a bank account the caller does not own is 404 (#105 T1)', { skip }, async () => {
  // Guards the account BEFORE the quote is consumed, so a caller who names
  // someone else's account does not burn their own quote finding out.
  const app = getApp()
  const seller = await createUser(app, { country: 'NG' })
  const stranger = await createUser(app, { country: 'NG' })
  const foreign = await createBankAccount(app, stranger.row.id)

  const res = await app.inject({
    method: 'POST', url: '/v1/fiat/offramp', headers: authHeader(seller.token),
    payload: { intent_id: 'no-such-intent', bank_account_id: foreign.id },
  })
  assert.strictEqual(res.statusCode, 404)
  assert.match(res.json().message, /bank account not found/)
})

test('GET /v1/fiat/intents/:id: another user\'s REAL intent is 404, not 403 (#105 T1)', { skip }, async () => {
  // The guard is `intent === null || intent.user_id !== request.user.id`, and
  // the ownership half is the half worth testing. A nonexistent id exercises
  // only the first clause — MEASURED: with the ownership check deleted, a
  // version of this case that used a random uuid still passed. So the intent
  // below is committed for real, by its owner, and then fetched by somebody
  // else.
  //
  // Ownership and existence answer identically on purpose: a 403 would confirm
  // that the id belongs to someone.
  const app = getApp()
  const restore = stubCoinGecko()
  try {
    await seedProvider(app)
    const owner = await createUser(app, { country: 'NG' })
    const account = await createBankAccount(app, owner.row.id, { country: 'NG' })
    const q = await quoteOfframp(app, owner.token)
    assert.strictEqual(q.statusCode, 200, q.body)
    const intentId = q.json().intent_id as string
    const off = await app.inject({
      method: 'POST', url: '/v1/fiat/offramp', headers: authHeader(owner.token),
      payload: { intent_id: intentId, bank_account_id: account.id },
    })
    assert.strictEqual(off.statusCode, 200, off.body)

    // The owner can read it...
    const mine = await app.inject({
      method: 'GET', url: `/v1/fiat/intents/${intentId}`, headers: authHeader(owner.token),
    })
    assert.strictEqual(mine.statusCode, 200)

    // ...and a stranger gets the same answer as for an id that does not exist.
    const stranger = await createUser(app, { country: 'NG' })
    const theirs = await app.inject({
      method: 'GET', url: `/v1/fiat/intents/${intentId}`, headers: authHeader(stranger.token),
    })
    assert.strictEqual(theirs.statusCode, 404)
    assert.match(theirs.json().message, /intent not found/)

    const absent = await app.inject({
      method: 'GET', url: '/v1/fiat/intents/00000000-0000-0000-0000-000000000000',
      headers: authHeader(stranger.token),
    })
    assert.strictEqual(absent.statusCode, 404)
  } finally {
    restore()
  }
})
