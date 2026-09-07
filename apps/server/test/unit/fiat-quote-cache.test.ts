/**
 * features/fiat-rails/quote-cache — the pre-commit quote primitive. Both impls
 * must behave identically: put/peek round-trip (non-consuming), take is a
 * one-shot atomic consume, and TTL-expiry yields null. The Redis impl is
 * exercised against a fake client that asserts the exact SET…EX / GET / GETDEL
 * commands (so the wire contract can't silently drift).
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  inMemoryQuoteCache,
  redisQuoteCache,
  quoteKey,
  type QuoteCache,
  type RedisLike,
  type StoredQuote,
} from '@server/features/fiat-rails/quote-cache'

const BASE_MS = 1_700_000_000_000

function quote(overrides: Partial<StoredQuote> = {}): StoredQuote {
  return {
    id: 'q-1',
    direction: 'offramp',
    user_id: 'user-1',
    wallet_address: 'W',
    chain_id: 'solana:devnet',
    provider: 'p2p_internal',
    fiat_currency: 'NGN',
    fiat_amount: '15000.0000',
    asset: 'USDC_SOL',
    asset_amount_raw: '9933333',
    rate: '1500.0000000000',
    fee_amount: '0.0000',
    kyc_required: false,
    kyc_url: null,
    quote_ref: 'ref-1',
    expires_at: new Date(BASE_MS).toISOString(),
    ...overrides,
  }
}

// ---------- in-memory (the test-only impl the unit deps use) ----------------

test('inMemory: put → peek round-trips without consuming; take consumes once', async () => {
  const cache = inMemoryQuoteCache(() => BASE_MS)
  await cache.put(quote(), 600)

  // peek is non-destructive: two peeks both return the quote.
  const a = await cache.peek('q-1')
  const b = await cache.peek('q-1')
  assert.deepStrictEqual(a, quote())
  assert.deepStrictEqual(b, quote())

  // take consumes: first returns it, second is null.
  assert.deepStrictEqual(await cache.take('q-1'), quote())
  assert.strictEqual(await cache.take('q-1'), null)
  assert.strictEqual(await cache.peek('q-1'), null)
})

test('inMemory: TTL-expired entries read as null on both peek and take', async () => {
  let clock = BASE_MS
  const cache: QuoteCache = inMemoryQuoteCache(() => clock)
  await cache.put(quote(), 600) // expires at BASE + 600s

  clock = BASE_MS + 601_000 // one second past expiry
  assert.strictEqual(await cache.peek('q-1'), null)
  assert.strictEqual(await cache.take('q-1'), null)
})

test('inMemory: gig_id survives the JSON round-trip; unknown id → null', async () => {
  const cache = inMemoryQuoteCache(() => BASE_MS)
  await cache.put(quote({ id: 'q-2', gig_id: 'gig-9' }), 600)
  assert.strictEqual((await cache.peek('q-2'))?.gig_id, 'gig-9')
  assert.strictEqual(await cache.peek('missing'), null)
})

// ---------- redis (the production impl) — fake client, exact commands --------

function fakeRedis(): RedisLike & { calls: string[]; store: Map<string, string> } {
  const store = new Map<string, string>()
  const calls: string[] = []
  return {
    calls,
    store,
    async set(key, value, mode, ttl) {
      calls.push(`SET ${key} ${mode} ${ttl}`)
      store.set(key, value)
      return 'OK'
    },
    async get(key) {
      calls.push(`GET ${key}`)
      return store.get(key) ?? null
    },
    async getdel(key) {
      calls.push(`GETDEL ${key}`)
      const v = store.get(key) ?? null
      store.delete(key)
      return v
    },
  }
}

test('redis: put issues SET…EX with the TTL under the namespaced key', async () => {
  const client = fakeRedis()
  const cache = redisQuoteCache(client)
  await cache.put(quote(), 600)
  assert.deepStrictEqual(client.calls, [`SET ${quoteKey('q-1')} EX 600`])
  // Value is the JSON-serialised quote.
  assert.deepStrictEqual(JSON.parse(client.store.get(quoteKey('q-1'))!), quote())
})

test('redis: peek uses GET (non-consuming); take uses GETDEL (one-shot)', async () => {
  const client = fakeRedis()
  const cache = redisQuoteCache(client)
  await cache.put(quote(), 600)

  assert.deepStrictEqual(await cache.peek('q-1'), quote())
  assert.ok(client.store.has(quoteKey('q-1')), 'peek must not delete')

  assert.deepStrictEqual(await cache.take('q-1'), quote())
  assert.ok(!client.store.has(quoteKey('q-1')), 'take must delete')
  assert.strictEqual(await cache.take('q-1'), null)

  assert.deepStrictEqual(client.calls, [
    `SET ${quoteKey('q-1')} EX 600`,
    `GET ${quoteKey('q-1')}`,
    `GETDEL ${quoteKey('q-1')}`,
    `GETDEL ${quoteKey('q-1')}`,
  ])
})

test('redis: a missing key reads as null on peek and take', async () => {
  const cache = redisQuoteCache(fakeRedis())
  assert.strictEqual(await cache.peek('nope'), null)
  assert.strictEqual(await cache.take('nope'), null)
})
