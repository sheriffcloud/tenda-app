/**
 * #98 — ADVERSARIAL: fiat quote money bounds. The onramp fiat_amount and
 * offramp asset_amount_raw feed numeric(20,4) / numeric(78,0) columns; an
 * unbounded value would overflow at persist time (postgres 500). The route
 * must reject out-of-range amounts with a clean 422 at validation — BEFORE
 * the provider lookup (so the assertion is 422, not the 503 a passed-through
 * absurd value reaches). Mirrors the exchange-offer guard.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { TEST_DB_CONFIGURED, useTestApp, createUser, authHeader, TEST_CHAIN_ID, TEST_ASSET } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

const WALLET = 'SolWallet1111111111111111111111111111111'

test('fiat quote onramp: an over-range fiat_amount is rejected 422 (not passed to the provider)', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const res = await app.inject({
    method: 'POST', url: '/v1/fiat/quote', headers: authHeader(u.token),
    payload: { direction: 'onramp', fiat_currency: 'NGN', asset: TEST_ASSET, chain_id: TEST_CHAIN_ID, wallet_address: WALLET, fiat_amount: 1e20 },
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /fiat_amount/)
})

test('fiat quote onramp: a non-positive fiat_amount is rejected', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const res = await app.inject({
    method: 'POST', url: '/v1/fiat/quote', headers: authHeader(u.token),
    payload: { direction: 'onramp', fiat_currency: 'NGN', asset: TEST_ASSET, chain_id: TEST_CHAIN_ID, wallet_address: WALLET, fiat_amount: 0 },
  })
  assert.strictEqual(res.statusCode, 422)
})

test('fiat quote offramp: an over-precision asset_amount_raw is rejected 422', { skip }, async () => {
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const res = await app.inject({
    method: 'POST', url: '/v1/fiat/quote', headers: authHeader(u.token),
    payload: { direction: 'offramp', fiat_currency: 'NGN', asset: TEST_ASSET, chain_id: TEST_CHAIN_ID, wallet_address: WALLET, asset_amount_raw: '9'.repeat(79) },
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /asset_amount_raw/)
})
