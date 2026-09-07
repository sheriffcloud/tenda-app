import { SUPPORTED_CURRENCIES, CURRENCY_META, type SupportedCurrency } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

export interface CachedExchangeRates {
  rates: Partial<Record<SupportedCurrency, number>>
  fetched_at: number
}

interface CacheEntry {
  value: CachedExchangeRates
  expiry: number
}

/** Per-coin cache (CoinGecko id → rates), so each asset is fetched at most once per TTL. */
const _cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Drop the in-process rate cache. The cache is a module singleton that
 * survives a DB TRUNCATE, so tests that stub the CoinGecko fetch must clear
 * it first (mirrors the harness's other in-memory cache resets) to avoid a
 * warmed entry masking the stub.
 */
export function invalidateExchangeRatesCache(): void {
  _cache.clear()
}

export const COINGECKO_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price'

/** CoinGecko id for SOL — the asset the wallet-display endpoint prices. */
const SOL_COINGECKO_ID = 'solana'

/**
 * Fetch a CoinGecko coin's fiat rates (all SUPPORTED_CURRENCIES) by coin id,
 * cached per id for 5 minutes. On CoinGecko failure, returns stale cache for
 * that id if available rather than erroring; throws 503 only when there is no
 * cached data to fall back on. Stablecoins (usd-coin, celo-dollar) resolve to
 * ~1 unit of USD in each fiat — exactly the conversion the offramp needs.
 */
export async function getAssetRates(coingeckoId: string): Promise<CachedExchangeRates> {
  const now = Date.now()
  const cached = _cache.get(coingeckoId)
  if (cached && now < cached.expiry) return cached.value

  const vs = SUPPORTED_CURRENCIES.map((c) => CURRENCY_META[c].coingeckoKey).join(',')

  let response: Response
  try {
    response = await fetch(
      `${COINGECKO_PRICE_URL}?ids=${coingeckoId}&vs_currencies=${vs}`,
      { signal: AbortSignal.timeout(10_000) },
    )
  } catch {
    if (cached) return cached.value
    throw new AppError(503, 'EXCHANGE_RATE_UNAVAILABLE', 'Exchange rate service is currently unavailable')
  }

  if (!response.ok) {
    if (cached) return cached.value
    throw new AppError(503, 'EXCHANGE_RATE_UNAVAILABLE', 'Exchange rate service is currently unavailable')
  }

  const data = (await response.json()) as Record<string, Record<string, number>>
  const coin = data[coingeckoId] ?? {}

  const rates: Partial<Record<SupportedCurrency, number>> = {}
  for (const currency of SUPPORTED_CURRENCIES) {
    const key = CURRENCY_META[currency].coingeckoKey
    if (typeof coin[key] === 'number' && coin[key] > 0) {
      rates[currency] = coin[key]
    }
  }

  const value: CachedExchangeRates = { rates, fetched_at: now }
  // Only cache a populated result — a 200 that omits the coin (partial
  // CoinGecko response) must not poison this id for the whole TTL; let the
  // next call retry instead.
  if (Object.keys(rates).length > 0) {
    _cache.set(coingeckoId, { value, expiry: now + CACHE_TTL_MS })
  }
  return value
}

/**
 * SOL fiat rates for the wallet-display endpoint (GET /v1/platform/exchange-rates).
 * A thin alias over getAssetRates so the display surface and the offramp rate
 * source share one CoinGecko client + cache.
 */
export async function getExchangeRates(): Promise<CachedExchangeRates> {
  return getAssetRates(SOL_COINGECKO_ID)
}
