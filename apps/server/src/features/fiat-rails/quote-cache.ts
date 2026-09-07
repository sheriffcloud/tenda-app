/**
 * Pre-commit quote cache (Redis). A price quote is ephemeral and high-churn
 * (every debounced amount edit on the Buy/Sell page mints one), so it lives in
 * Redis with a native TTL — NOT as a throwaway `fiat_intents` row. The durable
 * intent is created only when the user commits (initiate), reusing the quote's
 * id so the client's `intent_id` stays stable across quote → intent.
 *
 * The quote carries the full economic terms the server froze at quote time;
 * `initiate` reads them back from here (never from the client) so the price
 * can't be tampered with — the same tamper-proofing the old quoted-row gave.
 */

import type { FiatDirection } from './types'

const KEY_PREFIX = 'fiat:quote:'
export const quoteKey = (id: string): string => `${KEY_PREFIX}${id}`

/**
 * The slice of the ioredis client this cache uses (interface segregation): the
 * real `Redis` satisfies it structurally, and tests can supply a three-method
 * fake without standing up a server or casting.
 */
export interface RedisLike {
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>
  get(key: string): Promise<string | null>
  getdel(key: string): Promise<string | null>
}

/**
 * The server-frozen quote. Mirrors the `fiat_intents` economic columns (all
 * amounts are base-unit / fixed-point strings, as persisted) plus the
 * quote_ref the provider needs at initiate. JSON-serialisable end to end.
 */
export interface StoredQuote {
  id: string
  direction: FiatDirection
  user_id: string
  wallet_address: string
  chain_id: string
  provider: string
  fiat_currency: string
  fiat_amount: string
  asset: string
  asset_amount_raw: string
  rate: string
  fee_amount: string
  kyc_required: boolean
  kyc_url: string | null
  quote_ref: string
  /** Analytics linkage for the chained buy-then-post flow. */
  gig_id?: string
  /** ISO-8601; stamped onto the fiat_intents row at commit. */
  expires_at: string
}

export interface QuoteCache {
  /** Store a quote for `ttlSeconds`; overwrites any prior quote at this id. */
  put(quote: StoredQuote, ttlSeconds: number): Promise<void>
  /**
   * Non-consuming read, for validating guards (ownership, direction, currency)
   * WITHOUT burning the quote — a failed guard must leave a valid quote intact.
   * Returns null when unknown or TTL-expired.
   */
  peek(id: string): Promise<StoredQuote | null>
  /**
   * Atomically read AND consume the quote (one-shot). Returns null when the id
   * is unknown, already consumed, or TTL-expired. The atomic take is the
   * concurrency guard: only ONE initiate can win a given quote, so a
   * double-submit can't create two intents or fire two provider calls.
   */
  take(id: string): Promise<StoredQuote | null>
}

/** Production cache over a shared ioredis client. */
export function redisQuoteCache(client: RedisLike): QuoteCache {
  return {
    async put(quote, ttlSeconds) {
      await client.set(quoteKey(quote.id), JSON.stringify(quote), 'EX', ttlSeconds)
    },
    async peek(id) {
      const raw = await client.get(quoteKey(id))
      return raw === null ? null : (JSON.parse(raw) as StoredQuote)
    },
    async take(id) {
      // GETDEL is atomic (Redis 6.2+): the read and delete can't interleave,
      // so two concurrent takes never both see the value.
      const raw = await client.getdel(quoteKey(id))
      return raw === null ? null : (JSON.parse(raw) as StoredQuote)
    },
  }
}

/**
 * In-memory cache for TESTS only (never wired in production — it's per-process
 * and wouldn't share quotes across instances). Kept behaviourally identical to
 * the Redis impl: one-shot take, TTL-expiry → null, JSON round-trip.
 */
export function inMemoryQuoteCache(now: () => number = () => Date.now()): QuoteCache {
  const store = new Map<string, { value: string; expiresAt: number }>()
  return {
    async put(quote, ttlSeconds) {
      store.set(quoteKey(quote.id), { value: JSON.stringify(quote), expiresAt: now() + ttlSeconds * 1000 })
    },
    async peek(id) {
      const entry = store.get(quoteKey(id))
      if (entry === undefined || now() > entry.expiresAt) return null
      return JSON.parse(entry.value) as StoredQuote
    },
    async take(id) {
      const key = quoteKey(id)
      const entry = store.get(key)
      if (entry === undefined) return null
      store.delete(key) // one-shot regardless of expiry, matching GETDEL
      if (now() > entry.expiresAt) return null
      return JSON.parse(entry.value) as StoredQuote
    },
  }
}
