import { ENV } from '@/env'
import type { CurrencyCode } from '@/data/currencies'

/**
 * Public endpoints exposed by apps/server/src/routes/v1/platform/index.ts.
 * Reply types mirror the live shape of the responses (verified against
 * http://127.0.0.1:3000 — fee_bps: 250, seeker_fee_bps: 100, grace_period_seconds: 86400).
 */

export interface PlatformConfig {
  fee_bps: number
  seeker_fee_bps: number
  grace_period_seconds: number
}

export interface ExchangeRatesResponse {
  /** Partial because GHS may be missing from the upstream feed (open issue M83). */
  rates: Partial<Record<CurrencyCode, number>>
  fetched_at: number
}

export interface HealthResponse {
  status: 'ok' | string
  /** Server uptime in seconds. */
  uptime: number
}

const TTL_MS = 5 * 60 * 1000  // mirrors the server-side cache window

interface CacheEntry<T> {
  value: T
  expires: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

async function getCached<T>(key: string, fetcher: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const now = Date.now()
  const hit = cache.get(key) as CacheEntry<T> | undefined
  if (hit && hit.expires > now) return hit.value

  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing

  const promise = fetcher()
    .then((value) => {
      cache.set(key, { value, expires: Date.now() + TTL_MS })
      inflight.delete(key)
      return value
    })
    .catch((err) => {
      inflight.delete(key)
      throw err
    })

  inflight.set(key, promise)

  // If caller aborts, drop the inflight reference so the next call retries.
  signal?.addEventListener('abort', () => inflight.delete(key), { once: true })

  return promise
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${ENV.apiBaseUrl}${path}`
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`${path} → ${response.status}`)
  }
  return (await response.json()) as T
}

export function fetchPlatformConfig(signal?: AbortSignal): Promise<PlatformConfig> {
  return getCached('platform/config', () => getJson<PlatformConfig>('/v1/platform/config', signal), signal)
}

export function fetchExchangeRates(signal?: AbortSignal): Promise<ExchangeRatesResponse> {
  return getCached(
    'platform/exchange-rates',
    () => getJson<ExchangeRatesResponse>('/v1/platform/exchange-rates', signal),
    signal,
  )
}

/**
 * Health probe. Cached for 30 seconds — the footer status pill doesn't need
 * second-level freshness; the cache window keeps repeated landings cheap.
 */
const HEALTH_TTL = 30 * 1000
let healthCacheExpires = 0
let healthCachePromise: Promise<HealthResponse> | null = null
export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const now = Date.now()
  if (healthCachePromise && now < healthCacheExpires) return healthCachePromise
  healthCachePromise = getJson<HealthResponse>('/v1/health', signal).then((data) => {
    healthCacheExpires = Date.now() + HEALTH_TTL
    return data
  })
  return healthCachePromise
}

/** Test / dev helper. Not used in render paths. */
export function _resetPlatformCache() {
  cache.clear()
  inflight.clear()
}
