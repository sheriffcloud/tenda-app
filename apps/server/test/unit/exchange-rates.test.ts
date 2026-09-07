/**
 * #98 gap-fill — lib/exchange-rates (CoinGecko) via a mocked global fetch.
 *
 * The module holds a process-level 5-min cache, so tests are ORDERED:
 *   1. no-cache failure paths (503) run first while the cache is null,
 *   2. a success populates the cache,
 *   3. cache-hit short-circuits,
 *   4. stale-fallback paths advance Date.now past the TTL so the cache is
 *      present-but-expired (fetch is attempted, fails, stale is returned).
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert'
import { getExchangeRates, getAssetRates } from '@server/lib/exchange-rates'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response
}

const realFetch = globalThis.fetch
const realNow = Date.now
afterEach(() => {
  globalThis.fetch = realFetch
  Date.now = realNow
})

// Rates keyed by CoinGecko currency keys (lowercased ISO codes).
const GOOD_BODY = { solana: { ngn: 250000, usd: 150, gbp: 120, eur: 140, ghs: 2000, kes: 19000, zar: 2800, php: 8500 } }

test('getExchangeRates: throws 503 when the fetch fails and no cache exists', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('coingecko down'))) as typeof fetch
  await assert.rejects(getExchangeRates(), (err: { statusCode?: number }) => err.statusCode === 503)
})

test('getExchangeRates: throws 503 on a non-OK response with no cache', async () => {
  globalThis.fetch = (() => Promise.resolve(jsonResponse(429, 'rate limited'))) as typeof fetch
  await assert.rejects(getExchangeRates(), (err: { statusCode?: number }) => err.statusCode === 503)
})

test('getExchangeRates: a successful fetch parses SOL rates and caches them', async () => {
  globalThis.fetch = (() => Promise.resolve(jsonResponse(200, GOOD_BODY))) as typeof fetch
  const result = await getExchangeRates()
  assert.strictEqual(result.rates.NGN, 250000)
  assert.strictEqual(result.rates.USD, 150)
  assert.ok(typeof result.fetched_at === 'number')
})

test('getExchangeRates: a second call within the TTL is served from cache (no fetch)', async () => {
  let called = false
  globalThis.fetch = (() => { called = true; return Promise.resolve(jsonResponse(200, GOOD_BODY)) }) as typeof fetch
  const result = await getExchangeRates()
  assert.strictEqual(called, false, 'cache hit must not hit the network')
  assert.strictEqual(result.rates.USD, 150)
})

test('getExchangeRates: an expired cache + failed fetch falls back to the stale cache', async () => {
  Date.now = () => realNow() + 6 * 60 * 1000 // past the 5-min TTL
  globalThis.fetch = (() => Promise.reject(new Error('down again'))) as typeof fetch
  const result = await getExchangeRates()
  assert.strictEqual(result.rates.USD, 150, 'serves stale rather than erroring')
})

test('getExchangeRates: an expired cache + non-OK fetch also falls back to stale', async () => {
  Date.now = () => realNow() + 6 * 60 * 1000
  globalThis.fetch = (() => Promise.resolve(jsonResponse(500, 'err'))) as typeof fetch
  const result = await getExchangeRates()
  assert.strictEqual(result.rates.NGN, 250000)
})

// --- getAssetRates: the generalized, per-coin API (multi-asset pricing) ---

test('getAssetRates: prices an arbitrary coin id (ethereum) and parses its fiat rates', async () => {
  const body = { ethereum: { ngn: 5_000_000, usd: 3_500, kes: 450_000, ghs: 45_000, gbp: 2_800, eur: 3_200, zar: 60_000, php: 200_000 } }
  globalThis.fetch = ((url: string) => {
    assert.ok(url.includes('ids=ethereum'), 'fetches the requested coin id')
    return Promise.resolve(jsonResponse(200, body))
  }) as typeof fetch
  const result = await getAssetRates('ethereum')
  assert.strictEqual(result.rates.NGN, 5_000_000)
  assert.strictEqual(result.rates.KES, 450_000)
})

test('getAssetRates: a stablecoin (usd-coin) resolves ~1 unit per fiat', async () => {
  const body = { 'usd-coin': { ngn: 1_600, usd: 1, kes: 129, ghs: 12, gbp: 0.79, eur: 0.92, zar: 18, php: 57 } }
  globalThis.fetch = (() => Promise.resolve(jsonResponse(200, body))) as typeof fetch
  const result = await getAssetRates('usd-coin')
  assert.strictEqual(result.rates.NGN, 1_600)
  assert.strictEqual(result.rates.GHS, 12)
})

test('getAssetRates: caches are independent per coin id (no cross-contamination)', async () => {
  // usd-coin was cached above; a fetch failure now must NOT serve solana/eth data.
  globalThis.fetch = (() => Promise.reject(new Error('down'))) as typeof fetch
  const stable = await getAssetRates('usd-coin') // served from its own stale cache
  assert.strictEqual(stable.rates.NGN, 1_600)
  // A never-fetched coin has no cache to fall back on → 503.
  await assert.rejects(getAssetRates('celo'), (err: { statusCode?: number }) => err.statusCode === 503)
})

test('getAssetRates: a coin absent from the response body yields empty rates, not a crash', async () => {
  globalThis.fetch = (() => Promise.resolve(jsonResponse(200, { somethingElse: { usd: 1 } }))) as typeof fetch
  const result = await getAssetRates('celo-dollar')
  assert.deepStrictEqual(result.rates, {})
})

test('getAssetRates: an empty result is NOT cached — the next call retries (no 5-min poison)', async () => {
  let calls = 0
  globalThis.fetch = (() => { calls += 1; return Promise.resolve(jsonResponse(200, {})) }) as typeof fetch
  await getAssetRates('polkadot')
  await getAssetRates('polkadot')
  assert.strictEqual(calls, 2, 'empty response must not be served from cache')
})
