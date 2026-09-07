import { test } from 'node:test'
import * as assert from 'node:assert'
import { AppError } from '@server/lib/errors'
import {
  type NonceStore,
  consumeNonce,
  issueNonce,
} from '@server/lib/nonce'

// ---------- in-memory store -----------------------------------------------

interface Row {
  expires_at: Date
  consumed_at: Date | null
}

function inMemoryStore(): NonceStore & { _rows: Map<string, Row> } {
  const rows = new Map<string, Row>()
  return {
    _rows: rows,
    async insert({ nonce, expires_at }) {
      if (rows.has(nonce)) throw new Error(`duplicate nonce insert: ${nonce}`)
      rows.set(nonce, { expires_at, consumed_at: null })
    },
    async consumeIfFresh({ nonce, now }) {
      const row = rows.get(nonce)
      if (!row) return 'failed'
      if (row.consumed_at !== null) return 'failed'
      if (row.expires_at.getTime() <= now.getTime()) return 'failed'
      // Atomic compare-and-swap simulation.
      row.consumed_at = now
      return 'ok'
    },
    async classifyFailure({ nonce, now }) {
      const row = rows.get(nonce)
      if (!row) return 'unknown'
      if (row.consumed_at !== null) return 'replayed'
      if (row.expires_at.getTime() <= now.getTime()) return 'expired'
      return 'replayed'
    },
  }
}

function expectError(p: Promise<unknown>, code: string): Promise<AppError> {
  return p.then(
    () => assert.fail(`expected throw with code ${code}`),
    (err) => {
      if (!(err instanceof AppError)) throw err
      assert.strictEqual(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`)
      return err
    },
  )
}

// ---------- issueNonce ----------------------------------------------------

test('issueNonce: returns 43-char base64url, 300s TTL, ISO-8601 issued_at', async () => {
  const store = inMemoryStore()
  const result = await issueNonce(store)
  assert.match(result.nonce, /^[A-Za-z0-9_-]{43}$/)
  assert.strictEqual(result.expires_in, 300)
  // ISO-8601 string round-trips through Date.
  assert.strictEqual(new Date(result.issued_at).toISOString(), result.issued_at)
})

test('issueNonce: stored row expires_at ~ now + 300s', async () => {
  const store = inMemoryStore()
  const before = Date.now()
  const result = await issueNonce(store)
  const after = Date.now()
  const row = store._rows.get(result.nonce)
  assert.ok(row, 'row should be inserted')
  // expires_at should be in [before+300s, after+300s] inclusive.
  assert.ok(row.expires_at.getTime() >= before + 300_000)
  assert.ok(row.expires_at.getTime() <= after + 300_000 + 10)
})

test('issueNonce: 100 issues produce distinct nonces', async () => {
  const store = inMemoryStore()
  const seen = new Set<string>()
  for (let i = 0; i < 100; i++) {
    const result = await issueNonce(store)
    assert.ok(!seen.has(result.nonce), `duplicate nonce: ${result.nonce}`)
    seen.add(result.nonce)
  }
})

// ---------- consumeNonce: happy path -------------------------------------

test('consumeNonce: issue → consume → ok', async () => {
  const store = inMemoryStore()
  const issued = await issueNonce(store)
  await consumeNonce(store, issued.nonce)
  // No throw = pass.
})

// ---------- consumeNonce: replay -----------------------------------------

test('consumeNonce: double-consume → AUTH_NONCE_REPLAY', async () => {
  const store = inMemoryStore()
  const issued = await issueNonce(store)
  await consumeNonce(store, issued.nonce)
  await expectError(consumeNonce(store, issued.nonce), 'AUTH_NONCE_REPLAY')
})

// ---------- consumeNonce: unknown ----------------------------------------

test('consumeNonce: never-issued nonce → AUTH_NONCE_UNKNOWN', async () => {
  const store = inMemoryStore()
  // Well-formed but never inserted.
  const fake = 'A'.repeat(43)
  await expectError(consumeNonce(store, fake), 'AUTH_NONCE_UNKNOWN')
})

test('consumeNonce: malformed nonce → AUTH_NONCE_UNKNOWN (without DB hit)', async () => {
  const store = inMemoryStore()
  // Patch store so we can detect any DB access.
  let hit = false
  const wrapped: NonceStore = {
    insert: store.insert.bind(store),
    consumeIfFresh: async (args) => {
      hit = true
      return store.consumeIfFresh(args)
    },
    classifyFailure: async (args) => {
      hit = true
      return store.classifyFailure(args)
    },
  }
  await expectError(consumeNonce(wrapped, 'too-short'), 'AUTH_NONCE_UNKNOWN')
  assert.strictEqual(hit, false, 'malformed nonce should short-circuit before DB')
})

test('consumeNonce: wrong-charset nonce → AUTH_NONCE_UNKNOWN', async () => {
  const store = inMemoryStore()
  // Contains '+' and '/' which are standard-base64 chars, NOT base64url.
  await expectError(consumeNonce(store, '+'.repeat(43)), 'AUTH_NONCE_UNKNOWN')
})

// ---------- consumeNonce: expired ----------------------------------------

test('consumeNonce: past-expiry → AUTH_NONCE_EXPIRED', async () => {
  const store = inMemoryStore()
  const issued = await issueNonce(store)
  // Force the row's expires_at into the past.
  const row = store._rows.get(issued.nonce)
  assert.ok(row, 'inserted row must exist')
  row.expires_at = new Date(Date.now() - 60_000)
  await expectError(consumeNonce(store, issued.nonce), 'AUTH_NONCE_EXPIRED')
})

// ---------- consumeNonce: concurrent ------------------------------------

test('consumeNonce: 100 parallel consumes → exactly one succeeds', async () => {
  const store = inMemoryStore()
  const issued = await issueNonce(store)

  const results = await Promise.allSettled(
    Array.from({ length: 100 }, () => consumeNonce(store, issued.nonce)),
  )
  const ok = results.filter((r) => r.status === 'fulfilled').length
  const replays = results.filter(
    (r) => r.status === 'rejected' && r.reason instanceof AppError && r.reason.code === 'AUTH_NONCE_REPLAY',
  ).length

  assert.strictEqual(ok, 1, 'exactly one consume should succeed')
  assert.strictEqual(ok + replays, 100, 'all others must be AUTH_NONCE_REPLAY')
})

// ---------- format invariants -------------------------------------------

test('issueNonce: nonce alphabet is base64url (no +, /, =)', async () => {
  const store = inMemoryStore()
  for (let i = 0; i < 50; i++) {
    const r = await issueNonce(store)
    assert.doesNotMatch(r.nonce, /[+/=]/)
  }
})
