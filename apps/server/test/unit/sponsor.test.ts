import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  type SponsorStore,
  commitSponsoredTx,
  releaseSponsoredTx,
  reserveSponsoredTx,
} from '@server/lib/sponsor'

// ---------- in-memory store -----------------------------------------------

function inMemoryStore(initial: Map<string, number>): SponsorStore & {
  _slots: Map<string, number>
} {
  return {
    _slots: initial,
    async tryReserve(user_id) {
      const cur = initial.get(user_id) ?? 0
      if (cur <= 0) return false
      // CAS simulation — atomic by virtue of single-threaded test runtime.
      initial.set(user_id, cur - 1)
      return true
    },
    async refund(user_id) {
      initial.set(user_id, (initial.get(user_id) ?? 0) + 1)
    },
  }
}

const USER = 'user-1'

// ---------- chain-policy gate --------------------------------------------

test('reserve: Solana mainnet → sponsored=false, no DB hit', async () => {
  const store = inMemoryStore(new Map([[USER, 3]]))
  let hit = false
  const spied: SponsorStore = {
    tryReserve: async (u) => {
      hit = true
      return store.tryReserve(u)
    },
    refund: store.refund.bind(store),
  }
  const result = await reserveSponsoredTx(spied, { user_id: USER, chain_id: 'solana:mainnet' })
  assert.deepStrictEqual(result, { sponsored: false })
  assert.strictEqual(hit, false, 'Solana should short-circuit before DB')
  assert.strictEqual(store._slots.get(USER), 3, 'counter unchanged')
})

test('reserve: CELO mainnet → sponsored=false, no DB hit', async () => {
  const store = inMemoryStore(new Map([[USER, 3]]))
  let hit = false
  const spied: SponsorStore = {
    tryReserve: async (u) => {
      hit = true
      return store.tryReserve(u)
    },
    refund: store.refund.bind(store),
  }
  const result = await reserveSponsoredTx(spied, { user_id: USER, chain_id: 'eip155:42220' })
  assert.deepStrictEqual(result, { sponsored: false })
  assert.strictEqual(hit, false)
  assert.strictEqual(store._slots.get(USER), 3)
})

test('reserve: arbitrary unknown chain → sponsored=false, no DB hit', async () => {
  const store = inMemoryStore(new Map([[USER, 3]]))
  let hit = false
  const spied: SponsorStore = {
    tryReserve: async (u) => {
      hit = true
      return store.tryReserve(u)
    },
    refund: store.refund.bind(store),
  }
  const result = await reserveSponsoredTx(spied, { user_id: USER, chain_id: 'eip155:999999' })
  assert.deepStrictEqual(result, { sponsored: false })
  assert.strictEqual(hit, false)
})

// ---------- happy path (BASE) -------------------------------------------

test('reserve: BASE with slots > 0 → sponsored=true, slot decremented', async () => {
  const store = inMemoryStore(new Map([[USER, 3]]))
  const result = await reserveSponsoredTx(store, { user_id: USER, chain_id: 'eip155:8453' })
  assert.strictEqual(result.sponsored, true)
  if (result.sponsored) {
    assert.match(result.reservation_id, /^[0-9a-f-]{36}$/)
  }
  assert.strictEqual(store._slots.get(USER), 2)
})

test('reserve: BASE with slots=0 → sponsored=false, counter unchanged', async () => {
  const store = inMemoryStore(new Map([[USER, 0]]))
  const result = await reserveSponsoredTx(store, { user_id: USER, chain_id: 'eip155:8453' })
  assert.deepStrictEqual(result, { sponsored: false })
  assert.strictEqual(store._slots.get(USER), 0)
})

test('reserve: Base Sepolia is also paymaster-managed', async () => {
  const store = inMemoryStore(new Map([[USER, 1]]))
  const result = await reserveSponsoredTx(store, { user_id: USER, chain_id: 'eip155:84532' })
  assert.strictEqual(result.sponsored, true)
})

// ---------- atomicity ----------------------------------------------------

test('reserve: 10 parallel calls with 3 slots → exactly 3 succeed', async () => {
  const store = inMemoryStore(new Map([[USER, 3]]))
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      reserveSponsoredTx(store, { user_id: USER, chain_id: 'eip155:8453' }),
    ),
  )
  const ok = results.filter((r) => r.sponsored).length
  assert.strictEqual(ok, 3)
  assert.strictEqual(store._slots.get(USER), 0)

  // All reservation IDs are unique.
  const ids = results.filter((r) => r.sponsored).map((r) => (r.sponsored ? r.reservation_id : ''))
  assert.strictEqual(new Set(ids).size, 3, 'reservation_ids must be unique per call')
})

// ---------- release ------------------------------------------------------

test('release: refunds the counter', async () => {
  const store = inMemoryStore(new Map([[USER, 0]]))
  await releaseSponsoredTx(store, { user_id: USER })
  assert.strictEqual(store._slots.get(USER), 1)
})

test('reserve + release round-trip restores counter', async () => {
  const store = inMemoryStore(new Map([[USER, 3]]))
  const result = await reserveSponsoredTx(store, { user_id: USER, chain_id: 'eip155:8453' })
  assert.strictEqual(result.sponsored, true)
  if (!result.sponsored) return
  assert.strictEqual(store._slots.get(USER), 2)
  await releaseSponsoredTx(store, { user_id: USER })
  assert.strictEqual(store._slots.get(USER), 3)
})

// ---------- commit -------------------------------------------------------

test('commit: no-op (counter unchanged from reserve)', async () => {
  const store = inMemoryStore(new Map([[USER, 3]]))
  const result = await reserveSponsoredTx(store, { user_id: USER, chain_id: 'eip155:8453' })
  if (!result.sponsored) return assert.fail('expected sponsored')
  await commitSponsoredTx(store, { user_id: USER })
  assert.strictEqual(store._slots.get(USER), 2, 'commit must not refund')
})

// ---------- type-safety regression: reservation_id only on success -----

test('reservation_id is only accessible when sponsored is true', async () => {
  const store = inMemoryStore(new Map([[USER, 3]]))
  const result = await reserveSponsoredTx(store, { user_id: USER, chain_id: 'solana:mainnet' })
  // TypeScript narrows: result.sponsored === false means no reservation_id.
  if (result.sponsored) {
    // unreachable branch; TS knows reservation_id exists here
    assert.fail('Solana should not be sponsored')
  } else {
    // @ts-expect-error — reservation_id must NOT exist on { sponsored: false }
    void result.reservation_id
  }
})
