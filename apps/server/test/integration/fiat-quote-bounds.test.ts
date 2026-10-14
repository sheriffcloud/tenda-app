/**
 * #98 — ADVERSARIAL: fiat quote money bounds. The onramp fiat_amount and
 * offramp asset_amount_raw feed numeric(20,4) / numeric(78,0) columns; an
 * unbounded value would overflow at persist time (postgres 500). The route
 * must reject out-of-range amounts with a clean 422 at validation — BEFORE
 * the provider lookup (so the assertion is 422, not the 503 a passed-through
 * absurd value reaches). Mirrors the exchange-offer guard.
 *
 * It now also carries the route's CURRENCY rail, which is not a money bound but
 * belongs to the same set: the validation the route must do before it reaches a
 * provider, each rejected with the 422 this surface uses. It was the one guard
 * of the four with no case at all until #97 changed it.
 *
 * #105 T1 widened it again, past money bounds, to the rest of that same set —
 * the DIRECTION rail and the asset-registry check. The file's subject is
 * therefore "everything POST /v1/fiat/quote refuses before it reaches a
 * provider", and the money bounds are one family within it.
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

test('fiat quote: a currency outside the vocabulary is rejected 422, before any provider', { skip }, async () => {
  // #97 swapped this guard from an inline SUPPORTED_CURRENCIES.includes(x as
  // SupportedCurrency) to the shared isSupportedCurrency, and nothing pinned it
  // — the exchange route's twin has a case, this one did not, so the swap could
  // have changed the status code or dropped the check entirely unnoticed.
  // 'XXX' is three characters, so it clears requireStr's length rail and can
  // only be stopped by the vocabulary check itself.
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const res = await app.inject({
    method: 'POST', url: '/v1/fiat/quote', headers: authHeader(u.token),
    payload: { direction: 'onramp', fiat_currency: 'XXX', asset: TEST_ASSET, chain_id: TEST_CHAIN_ID, wallet_address: WALLET, fiat_amount: 5000 },
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /fiat_currency/)
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

test('fiat quote: an unknown direction is refused before any provider (#105 T1)', { skip }, async () => {
  // The first guard on the route. Anything but 'onramp'/'offramp' cannot be
  // routed at all, so it must not reach provider selection.
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  for (const direction of ['sideways', '', 'ONRAMP']) {
    const res = await app.inject({
      method: 'POST', url: '/v1/fiat/quote', headers: authHeader(u.token),
      payload: { direction, fiat_currency: 'NGN', asset: TEST_ASSET, chain_id: TEST_CHAIN_ID, wallet_address: WALLET, fiat_amount: 5000 },
    })
    assert.strictEqual(res.statusCode, 422, direction)
    assert.match(res.json().message, /direction must be 'onramp' or 'offramp'/)
  }
})

test('fiat quote offramp: a non-canonical asset_amount_raw is refused (#105 T1)', { skip }, async () => {
  // Distinct from the over-precision case above: these parse as numbers but are
  // not canonical base units, and would reach numeric(78,0) as-is.
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  for (const bad of ['1.5', '-5', '007', 'abc', '']) {
    const res = await app.inject({
      method: 'POST', url: '/v1/fiat/quote', headers: authHeader(u.token),
      payload: { direction: 'offramp', fiat_currency: 'NGN', asset: TEST_ASSET, chain_id: TEST_CHAIN_ID, wallet_address: WALLET, asset_amount_raw: bad },
    })
    assert.strictEqual(res.statusCode, 422, bad)
    assert.match(res.json().message, /asset_amount_raw must be canonical/)
  }
})

test('fiat quote: an asset that is not on the requested chain is refused (#105 T1)', { skip }, async () => {
  // The asset registry owns the asset -> chain mapping, and decimals are read
  // from it rather than from the client. An asset the chain does not carry must
  // stop here, before a quote is priced against the wrong decimals.
  const app = getApp()
  const u = await createUser(app, { country: 'NG' })
  const res = await app.inject({
    method: 'POST', url: '/v1/fiat/quote', headers: authHeader(u.token),
    payload: { direction: 'onramp', fiat_currency: 'NGN', asset: 'NOT_A_REGISTERED_ASSET', chain_id: TEST_CHAIN_ID, wallet_address: WALLET, fiat_amount: 5000 },
  })
  assert.strictEqual(res.statusCode, 422)
  assert.match(res.json().message, /unknown asset for this chain/)
})
