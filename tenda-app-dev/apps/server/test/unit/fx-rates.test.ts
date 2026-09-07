/**
 * `getUsdFxRates` — the USD→fiat leg of a cross-rate quote.
 *
 * It is the second of two feeds a Ghanaian or Kenyan quote depends on, which
 * makes its FAILURE behaviour the part worth pinning: a quote that silently
 * priced off a missing or zero rate would produce NaN and travel a long way
 * before anyone noticed, and one that refused whenever the feed hiccupped
 * would take instant-sell down for a pair that changes once a day.
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { getUsdFxRates, invalidateFxRatesCache, FX_RATES_URL } from '@server/lib/fx-rates'
import { ErrorCode } from '@tenda/shared'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response
}

const realFetch = globalThis.fetch
const realNow = Date.now

/** Past the 6h TTL, so the cache is present-but-expired rather than absent. */
function expireTheCache(): void {
  Date.now = () => realNow() + 7 * 60 * 60 * 1000
}

beforeEach(() => {
  invalidateFxRatesCache()
})
afterEach(() => {
  globalThis.fetch = realFetch
  Date.now = realNow
})

test('reads USD→fiat rates for the currencies we settle in', async () => {
  globalThis.fetch = (() =>
    Promise.resolve(jsonResponse({ rates: { GHS: 11.18, KES: 129.45, NGN: 1350.75 } }))) as typeof fetch

  const { rates } = await getUsdFxRates()
  assert.strictEqual(rates.GHS, 11.18)
  assert.strictEqual(rates.KES, 129.45)
})

test('keeps only our vocabulary, not the 160-odd currencies the feed carries', async () => {
  // A rate we can neither format nor settle in is not a rate we have any use
  // for, and letting it through would put an unsupported code into a Record
  // typed by SupportedCurrency.
  globalThis.fetch = (() =>
    Promise.resolve(jsonResponse({ rates: { GHS: 11.18, XPF: 105.2, ISK: 138.9 } }))) as typeof fetch

  const { rates } = await getUsdFxRates()
  assert.deepStrictEqual(Object.keys(rates), ['GHS'])
})

test('drops a non-positive or non-numeric rate rather than quoting off it', async () => {
  // Zero is the dangerous one: it is a number, it passes a truthiness check in
  // some shapes, and it turns a cross-rate into 0 — a free cash-out.
  globalThis.fetch = (() =>
    Promise.resolve(jsonResponse({ rates: { GHS: 0, KES: -1, NGN: '1350', ZAR: 15.9 } }))) as typeof fetch

  const { rates } = await getUsdFxRates()
  assert.deepStrictEqual(Object.keys(rates), ['ZAR'])
})

test('a second call inside the TTL does not hit the feed again', async () => {
  let calls = 0
  globalThis.fetch = (() => {
    calls += 1
    return Promise.resolve(jsonResponse({ rates: { GHS: 11.18 } }))
  }) as typeof fetch

  await getUsdFxRates()
  await getUsdFxRates()
  assert.strictEqual(calls, 1, 'the daily FX pair was re-fetched within the TTL')
})

/**
 * The EXPIRED cache is the interesting one, and the clock has to move for it to
 * exist. Without advancing Date.now these two would be served by the live cache
 * at the top of the function, never attempt a fetch, and pass with the stale
 * fallback deleted — testing the TTL a second time while claiming to test the
 * outage path.
 */
test('an expired cache plus a failed fetch serves the stale rate', async () => {
  globalThis.fetch = (() => Promise.resolve(jsonResponse({ rates: { GHS: 11.18 } }))) as typeof fetch
  await getUsdFxRates()

  expireTheCache()
  globalThis.fetch = (() => Promise.reject(new Error('network down'))) as typeof fetch
  const { rates } = await getUsdFxRates()
  assert.strictEqual(rates.GHS, 11.18, 'a warmed rate must survive an outage')
})

test('an expired cache plus a non-ok response also serves stale', async () => {
  globalThis.fetch = (() => Promise.resolve(jsonResponse({ rates: { GHS: 11.18 } }))) as typeof fetch
  await getUsdFxRates()

  expireTheCache()
  globalThis.fetch = (() => Promise.resolve(jsonResponse({}, false, 502))) as typeof fetch
  assert.strictEqual((await getUsdFxRates()).rates.GHS, 11.18)
})

test('with nothing cached, an outage is a 503 rather than an empty rate set', async () => {
  // Distinct from the stale path above, and the reason it cannot just return
  // `{}`: an empty map reads to the caller as "no rate for GHS", which is a
  // permanent-looking answer to a transient problem.
  globalThis.fetch = (() => Promise.reject(new Error('network down'))) as typeof fetch
  await assert.rejects(getUsdFxRates(), (e: { statusCode?: number }) => e.statusCode === 503)
})

test('with nothing cached, a non-ok response is a 503 as well', async () => {
  // The twin of the outage case above, and a separate arm: a feed that answers
  // 502 has not thrown, so it reaches a different branch on the way to the same
  // refusal. Without this the non-ok path is only ever seen WITH a warm cache.
  globalThis.fetch = (() => Promise.resolve(jsonResponse({}, false, 502))) as typeof fetch
  await assert.rejects(getUsdFxRates(), (e: { statusCode?: number }) => e.statusCode === 503)
})

test('a 200 carrying no usable rate is not cached for the next six hours', async () => {
  // A partial feed response must not poison the window; the next call retries.
  globalThis.fetch = (() => Promise.resolve(jsonResponse({ rates: {} }))) as typeof fetch
  assert.deepStrictEqual((await getUsdFxRates()).rates, {})

  // No clock move here on purpose: the retry has to happen INSIDE the TTL, which
  // is the whole claim — an empty answer must not be cached at all.
  globalThis.fetch = (() => Promise.resolve(jsonResponse({ rates: { GHS: 11.18 } }))) as typeof fetch
  assert.strictEqual((await getUsdFxRates()).rates.GHS, 11.18, 'the empty answer was cached')
})

test('a body with no rates key at all is handled, not thrown through', async () => {
  globalThis.fetch = (() => Promise.resolve(jsonResponse({ result: 'error' }))) as typeof fetch
  assert.deepStrictEqual((await getUsdFxRates()).rates, {})
})

test('asks the USD-based endpoint, since USD is the leg CoinGecko always gives', async () => {
  let asked = ''
  globalThis.fetch = ((url: string) => {
    asked = String(url)
    return Promise.resolve(jsonResponse({ rates: { GHS: 11.18 } }))
  }) as typeof fetch

  await getUsdFxRates()
  assert.strictEqual(asked, FX_RATES_URL)
  assert.ok(asked.endsWith('/USD'), 'the cross leg must be USD-based')
})

/**
 * THE CODE, not merely the status. Every other assertion here checks
 * `statusCode === 503`, which is satisfied by any string in the `code` field —
 * `AppError.code` is typed `ErrorCode | string`, so the compiler does not
 * constrain it either. Between the two, a code outside the registry can be
 * emitted with nothing objecting anywhere.
 *
 * It has to be the SAME code the rest of the call path uses. A Ghanaian
 * instant-sell that cannot be priced is one failure to the user however it
 * fails, and `midRate` already answers SERVICE_UNAVAILABLE for its other four
 * refusals; a second code for the FX leg would make one user action return two
 * different machine-readable answers.
 */
test('refuses with a registry ErrorCode, the same one the rest of the path uses', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('network down'))) as typeof fetch
  await assert.rejects(getUsdFxRates(), (e: { code?: string }) => {
    assert.strictEqual(e.code, ErrorCode.SERVICE_UNAVAILABLE)
    return true
  })

  invalidateFxRatesCache()
  globalThis.fetch = (() => Promise.resolve(jsonResponse({}, false, 502))) as typeof fetch
  await assert.rejects(getUsdFxRates(), (e: { code?: string }) => {
    assert.strictEqual(e.code, ErrorCode.SERVICE_UNAVAILABLE)
    return true
  })
})

/**
 * The request must be BOUNDED. A hung upstream with no timeout holds the quote
 * request open until something else gives up, and the FX feed is the second of
 * two network calls on that path.
 *
 * This asserts the signal is wired, not that ten seconds elapse — waiting out a
 * real timeout would make the suite slow and flaky for no extra information.
 * The failure mode worth catching is someone dropping the argument, and that is
 * exactly what this sees.
 */
test('bounds the request with an abort signal', async () => {
  let signal: unknown = null
  globalThis.fetch = ((_url: string, init?: { signal?: unknown }) => {
    signal = init?.signal ?? null
    return Promise.resolve(jsonResponse({ rates: { GHS: 11.18 } }))
  }) as typeof fetch

  await getUsdFxRates()
  assert.ok(signal instanceof AbortSignal, 'the FX request must carry a timeout signal')
})
