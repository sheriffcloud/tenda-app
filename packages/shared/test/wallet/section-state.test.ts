/**
 * resolveWalletSection (ported from mobile's jest suite when the resolver
 * moved to shared). Regression pins for the two bugs it exists to prevent: a
 * load FAILURE rendering as "no wallet linked", and an unusable chain
 * registry rendering as a real `0.00` balance.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { isRegistryUsable, resolveWalletSection, type WalletSectionInput } from '../../src/wallet'

/** A user with wallets and a healthy registry — the all-good baseline. */
const base: WalletSectionInput = {
  walletsStatus: 'ready',
  hasWallet: true,
  chainsStatus: 'ready',
  registryUsable: true,
}

test('both dependencies usable → ready', () => {
  assert.strictEqual(resolveWalletSection(base), 'ready')
})

test('no wallets yet and the load is idle/loading → loading, never "no wallet linked"', () => {
  for (const walletsStatus of ['idle', 'loading'] as const) {
    assert.strictEqual(resolveWalletSection({ ...base, hasWallet: false, walletsStatus }), 'loading')
  }
})

test('wallets load failed → wallets-error (not the empty state, which would be a lie)', () => {
  assert.strictEqual(
    resolveWalletSection({ ...base, hasWallet: false, walletsStatus: 'error' }),
    'wallets-error',
  )
})

test('wallets load settled empty → no-wallet', () => {
  assert.strictEqual(
    resolveWalletSection({ ...base, hasWallet: false, walletsStatus: 'ready' }),
    'no-wallet',
  )
})

test('a registry failure is NOT the user’s problem while they have no wallet', () => {
  assert.strictEqual(
    resolveWalletSection({
      walletsStatus: 'ready',
      hasWallet: false,
      chainsStatus: 'error',
      registryUsable: false,
    }),
    'no-wallet',
  )
})

test('wallets linked but the registry FAILED → balances-unavailable, not a zero balance', () => {
  assert.strictEqual(
    resolveWalletSection({ ...base, chainsStatus: 'error', registryUsable: false }),
    'balances-unavailable',
  )
})

test('wallets linked and the registry is idle/loading → loading (a retry would be premature)', () => {
  for (const chainsStatus of ['idle', 'loading'] as const) {
    assert.strictEqual(
      resolveWalletSection({ ...base, chainsStatus, registryUsable: false }),
      'loading',
    )
  }
})

test('a registry reporting ready but holding nothing usable still cannot render balances', () => {
  assert.strictEqual(
    resolveWalletSection({ ...base, chainsStatus: 'ready', registryUsable: false }),
    'loading',
  )
})

test('a stale-but-usable registry still renders balances after a failed refresh', () => {
  assert.strictEqual(
    resolveWalletSection({ ...base, chainsStatus: 'ready', registryUsable: true }),
    'ready',
  )
})

test('isRegistryUsable: null and EMPTY are both unusable — only a non-empty registry reads', () => {
  // An empty array is reachable (persisted [], or a deployment with no
  // enabled chains) and must not be mistaken for "loaded".
  assert.strictEqual(isRegistryUsable(null), false)
  assert.strictEqual(isRegistryUsable([]), false)
  assert.strictEqual(isRegistryUsable([{ id: 'solana:devnet' }]), true)
})
