/**
 * normalizeWalletAddress — the canonical-form rule that dedups EVM wallets.
 * Pure: no DB. Adversarial-first — the bug it fixes is the SAME EVM wallet
 * stored twice in different case, and the trap it must NOT fall into is
 * lowercasing a case-sensitive Solana (base58) address.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { normalizeWalletAddress, sameWalletAddress } from '@server/lib/auth/wallet-address'

test('eip155: lowercases a checksummed address so case-variants collapse to one', () => {
  const checksummed = '0xAbC0000000000000000000000000000000000001'
  assert.strictEqual(
    normalizeWalletAddress('eip155', checksummed),
    '0xabc0000000000000000000000000000000000001',
  )
  // Two case-variants of the same wallet normalise to the SAME key.
  assert.strictEqual(
    normalizeWalletAddress('eip155', checksummed),
    normalizeWalletAddress('eip155', checksummed.toLowerCase()),
  )
})

test('eip155: an already-lowercased address is unchanged (idempotent)', () => {
  const lower = '0xabc0000000000000000000000000000000000001'
  assert.strictEqual(normalizeWalletAddress('eip155', lower), lower)
  assert.strictEqual(
    normalizeWalletAddress('eip155', normalizeWalletAddress('eip155', lower)),
    lower,
  )
})

test('solana: passes base58 through UNTOUCHED (case is significant)', () => {
  const addr = 'TestSolanaAddress11111111111111111111111111'
  assert.strictEqual(normalizeWalletAddress('solana', addr), addr)
  // Different case is a DIFFERENT Solana address — must NOT be collapsed.
  assert.notStrictEqual(
    normalizeWalletAddress('solana', addr),
    normalizeWalletAddress('solana', addr.toLowerCase()),
  )
})

test('sameWalletAddress: eip155 folds case on BOTH sides (legacy mixed-case ↔ checksummed)', () => {
  const mixed = '0xAbC0000000000000000000000000000000000001'
  assert.ok(sameWalletAddress('eip155', mixed, mixed.toLowerCase()))
  assert.ok(sameWalletAddress('eip155', mixed.toLowerCase(), mixed.toUpperCase()))
  // A genuinely different EVM address is not the same wallet.
  assert.ok(!sameWalletAddress('eip155', mixed, '0xabc0000000000000000000000000000000000002'))
})

test('sameWalletAddress: solana compares exactly (case is significant)', () => {
  const addr = 'TestSolanaAddress11111111111111111111111111'
  assert.ok(sameWalletAddress('solana', addr, addr))
  assert.ok(!sameWalletAddress('solana', addr, addr.toLowerCase()))
})
