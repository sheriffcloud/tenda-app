import { test } from 'node:test'
import * as assert from 'node:assert'
import { dedupKey, parseDedupKey } from '@server/core/queue/idempotency'

test('dedupKey: well-formed inputs round-trip', () => {
  const key = dedupKey({ chain_ns: 'solana', tx_ref: '5xj_nQ4', event: 'EscrowAccepted' })
  assert.strictEqual(key, 'solana:5xj_nQ4:EscrowAccepted')
  assert.deepStrictEqual(parseDedupKey(key), {
    chain_ns: 'solana',
    tx_ref: '5xj_nQ4',
    event: 'EscrowAccepted',
  })
})

test('dedupKey: eip155 round-trip', () => {
  const key = dedupKey({
    chain_ns: 'eip155',
    tx_ref: '0xabc123',
    event: 'EscrowApproved',
  })
  assert.strictEqual(key, 'eip155:0xabc123:EscrowApproved')
  assert.deepStrictEqual(parseDedupKey(key), {
    chain_ns: 'eip155',
    tx_ref: '0xabc123',
    event: 'EscrowApproved',
  })
})

test('dedupKey: empty tx_ref throws', () => {
  assert.throws(
    () => dedupKey({ chain_ns: 'solana', tx_ref: '', event: 'EscrowAccepted' }),
    /must not be empty/,
  )
})

test('dedupKey: tx_ref containing separator throws', () => {
  assert.throws(
    () => dedupKey({ chain_ns: 'solana', tx_ref: 'has:colon', event: 'EscrowAccepted' }),
    /must not be empty or contain ":"/,
  )
})

test('parseDedupKey: invalid namespace → null', () => {
  assert.strictEqual(parseDedupKey('bitcoin:abc:EscrowAccepted'), null)
})

test('parseDedupKey: unknown event name → null (no silent cast)', () => {
  assert.strictEqual(parseDedupKey('solana:abc:NotARealEvent'), null)
})

test('parseDedupKey: missing segments → null', () => {
  assert.strictEqual(parseDedupKey('solana:abc'), null)
  assert.strictEqual(parseDedupKey('solana'), null)
  assert.strictEqual(parseDedupKey(''), null)
})

test('parseDedupKey: too many segments → null', () => {
  assert.strictEqual(parseDedupKey('solana:abc:def:Extra'), null)
})

test('parseDedupKey: empty tx_ref → null', () => {
  assert.strictEqual(parseDedupKey('solana::EscrowAccepted'), null)
})
