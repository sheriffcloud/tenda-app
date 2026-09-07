/**
 * wallet-dedupe — the pure keeper-selection for collapsing case-duplicate wallet
 * rows. Adversarial: must keep the PRIMARY (never strand the one-primary
 * invariant), must NOT collapse case-sensitive Solana, and must leave unique
 * wallets untouched.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  chooseWalletKeeper,
  planWalletDedupe,
  walletDedupeKey,
  type WalletRow,
} from '@server/lib/auth/wallet-dedupe'

const U = '11111111-1111-1111-1111-111111111111'
function row(over: Partial<WalletRow> = {}): WalletRow {
  return {
    user_id: U,
    chain_ns: 'eip155',
    address: '0xabc0000000000000000000000000000000000001',
    is_primary: false,
    verified_at: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}

test('walletDedupeKey folds eip155 case but not solana', () => {
  const a = walletDedupeKey({ user_id: U, chain_ns: 'eip155', address: '0xAbC1' })
  const b = walletDedupeKey({ user_id: U, chain_ns: 'eip155', address: '0xabc1' })
  assert.strictEqual(a, b)
  const s1 = walletDedupeKey({ user_id: U, chain_ns: 'solana', address: 'SoLAbc' })
  const s2 = walletDedupeKey({ user_id: U, chain_ns: 'solana', address: 'solabc' })
  assert.notStrictEqual(s1, s2)
})

test('chooseWalletKeeper prefers the primary row', () => {
  const lower = row({ address: '0xabc...1', is_primary: false })
  const mixedPrimary = row({ address: '0xAbC...1', is_primary: true })
  assert.strictEqual(chooseWalletKeeper([lower, mixedPrimary]), mixedPrimary)
})

test('chooseWalletKeeper falls back to earliest-verified, then address', () => {
  const older = row({ address: '0xz', verified_at: new Date('2026-01-01T00:00:00Z') })
  const newer = row({ address: '0xa', verified_at: new Date('2026-02-01T00:00:00Z') })
  assert.strictEqual(chooseWalletKeeper([newer, older]), older)
  // Same timestamp → deterministic by address.
  const sameA = row({ address: '0xa' })
  const sameB = row({ address: '0xb' })
  assert.strictEqual(chooseWalletKeeper([sameB, sameA]), sameA)
})

test('planWalletDedupe deletes only the non-keeper case-duplicates', () => {
  const primary = row({ address: '0xAbC0000000000000000000000000000000000001', is_primary: true })
  const dupLower = row({ address: '0xabc0000000000000000000000000000000000001' })
  const unrelated = row({ address: '0xdef0000000000000000000000000000000000002' })
  const toDelete = planWalletDedupe([primary, dupLower, unrelated])
  assert.deepStrictEqual(toDelete, [dupLower]) // primary kept, unique untouched
})

test('planWalletDedupe returns nothing when there are no duplicates', () => {
  assert.deepStrictEqual(planWalletDedupe([row({ address: '0x1' }), row({ address: '0x2' })]), [])
})

test('planWalletDedupe does NOT collapse case-sensitive Solana variants', () => {
  const a = row({ chain_ns: 'solana', address: 'SoLWalletAbc' })
  const b = row({ chain_ns: 'solana', address: 'solwalletabc' })
  assert.deepStrictEqual(planWalletDedupe([a, b]), [])
})

test('planWalletDedupe scopes duplicates per user (same address, different users)', () => {
  const u1 = row({ user_id: 'aaaa', address: '0xAbC1', is_primary: true })
  const u2 = row({ user_id: 'bbbb', address: '0xabc1', is_primary: true })
  assert.deepStrictEqual(planWalletDedupe([u1, u2]), []) // different owners — not duplicates
})
