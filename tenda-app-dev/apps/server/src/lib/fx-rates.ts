import { SUPPORTED_CURRENCIES, ErrorCode, type SupportedCurrency } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

/**
 * USD-based fiat FX rates — the second leg of a cross-rate quote.
 *
 * WHY THIS EXISTS. CoinGecko prices crypto in ~60 fiats, and two of our payout
 * currencies are not among them: it returns no `ghs` and no `kes`, so
 * `midRate(asset, 'GHS')` had no number to answer with and the instant-sell
 * quote 503'd permanently for Ghana and Kenya. Crossing through USD gets it
 * back — CoinGecko always prices in USD, and an FX feed carries USD→GHS.
 *
 * WHY A SEPARATE CLIENT rather than a branch inside exchange-rates. Different
 * upstream, and a very different clock. The crypto leg moves by the second and
 * is cached for five minutes; a fiat pair moves by the day — this feed
 * republishes once every 24h and stamps the next update in the body — so
 * caching it for five minutes would spend ~288 requests a day re-reading a
 * number that changed once. The long TTL here is a property of the data, not a
 * tuning guess.
 *
 * A NOTE ON ACCURACY, since a two-hop rate invites the question. For the four
 * payout currencies CoinGecko does carry, direct and crossed rates were
 * compared against both live feeds: NGN differed by 0.45%, ZAR/PHP/AED by
 * 0.12% or less. That is inside the quote spread, and it also says the FX feed
 * is not quoting an official rate detached from the market one — which was the
 * real risk with NGN specifically.
 */
export const FX_RATES_URL = 'https://open.er-api.com/v6/latest/USD'

export interface CachedFxRates {
  /** Units of the currency per 1 USD, restricted to our vocabulary. */
  rates: Partial<Record<SupportedCurrency, number>>
}

interface CacheEntry {
  value: CachedFxRates
  expiry: number
}

let _cache: CacheEntry | null = null

/** Fiat pairs republish daily; re-reading one every five minutes buys nothing. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/**
 * Drop the in-process FX cache. Module singleton, so a test that stubs the
 * feed must clear it first or a warmed entry answers for a stub that never
 * ran — the same hazard, and the same remedy, as the CoinGecko cache.
 */
export function invalidateFxRatesCache(): void {
  _cache = null
}

/**
 * USD→fiat rates for every SUPPORTED_CURRENCIES member the feed carries,
 * cached process-wide. On a feed failure returns the stale cache if there is
 * one, and throws 503 only when there is nothing to fall back on — the same
 * degradation order as `getAssetRates`, because a rate an hour old is worth
 * far more to a quote than no rate at all.
 */
export async function getUsdFxRates(): Promise<CachedFxRates> {
  const now = Date.now()
  if (_cache !== null && now < _cache.expiry) return _cache.value

  let response: Response
  try {
    response = await fetch(FX_RATES_URL, { signal: AbortSignal.timeout(10_000) })
  } catch {
    if (_cache !== null) return _cache.value
    throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'FX rate service is currently unavailable')
  }

  if (!response.ok) {
    if (_cache !== null) return _cache.value
    throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'FX rate service is currently unavailable')
  }

  const body = (await response.json()) as { rates?: Record<string, unknown> }
  const feed = body.rates ?? {}

  // Filtered to the vocabulary rather than passed through: the feed carries 160+
  // currencies, and a rate for one we cannot format or settle in is not a rate
  // we have any use for.
  const rates: Partial<Record<SupportedCurrency, number>> = {}
  for (const currency of SUPPORTED_CURRENCIES) {
    const value = feed[currency]
    if (typeof value === 'number' && value > 0) {
      rates[currency] = value
    }
  }

  const value: CachedFxRates = { rates }
  // Only cache a populated result, so a 200 that carried no usable rates does
  // not poison the next six hours — the same rule getAssetRates follows.
  if (Object.keys(rates).length > 0) {
    _cache = { value, expiry: now + CACHE_TTL_MS }
  }
  return value
}
