/**
 * resolveWalletSection — the wallet screen's branch resolver. These cases are
 * the regression pins for the two bugs it exists to prevent: a load FAILURE
 * rendering as "no wallet linked", and an unusable chain registry rendering as
 * a real `0.00` balance.
 */
import { resolveWalletSection, type WalletSectionInput } from '@/lib/wallet-section-state'

/** A user with wallets and a healthy registry — the all-good baseline. */
const base: WalletSectionInput = {
  walletsStatus: 'ready',
  hasWallet: true,
  chainsStatus: 'ready',
  registryUsable: true,
}

test('both dependencies usable → ready', () => {
  expect(resolveWalletSection(base)).toBe('ready')
})

// ─── the wallet list resolves first ───────────────────────────────────────────

test.each(['idle', 'loading'] as const)(
  'no wallets yet and the load is %s → loading, never "no wallet linked"',
  (walletsStatus) => {
    expect(resolveWalletSection({ ...base, hasWallet: false, walletsStatus })).toBe('loading')
  },
)

test('wallets load failed → wallets-error (not the empty state, which would be a lie)', () => {
  expect(
    resolveWalletSection({ ...base, hasWallet: false, walletsStatus: 'error' }),
  ).toBe('wallets-error')
})

test('wallets load settled empty → no-wallet', () => {
  expect(
    resolveWalletSection({ ...base, hasWallet: false, walletsStatus: 'ready' }),
  ).toBe('no-wallet')
})

test('a registry failure is NOT the user’s problem while they have no wallet', () => {
  // Nothing to read balances for, so the wallet-level answer wins.
  expect(
    resolveWalletSection({
      walletsStatus: 'ready',
      hasWallet: false,
      chainsStatus: 'error',
      registryUsable: false,
    }),
  ).toBe('no-wallet')
})

// ─── the registry gate (the reported bug) ─────────────────────────────────────

test('wallets linked but the registry FAILED → balances-unavailable, not a zero balance', () => {
  expect(
    resolveWalletSection({ ...base, chainsStatus: 'error', registryUsable: false }),
  ).toBe('balances-unavailable')
})

test.each(['idle', 'loading'] as const)(
  'wallets linked and the registry is %s → loading (a retry would be premature)',
  (chainsStatus) => {
    expect(resolveWalletSection({ ...base, chainsStatus, registryUsable: false })).toBe('loading')
  },
)

test('a registry reporting ready but holding nothing usable still cannot render balances', () => {
  // Defends the invariant rather than the current caller: `registryUsable` is
  // the authority on whether a balance read can produce anything.
  expect(
    resolveWalletSection({ ...base, chainsStatus: 'ready', registryUsable: false }),
  ).toBe('loading')
})

test('a stale-but-usable registry still renders balances after a failed refresh', () => {
  // Hydrated from cache, refresh failed, status held at ready — the user keeps
  // seeing real figures rather than an error over perfectly good data.
  expect(resolveWalletSection({ ...base, chainsStatus: 'ready', registryUsable: true })).toBe('ready')
})
