/**
 * Wallet screen — the balance section's branch wiring.
 *
 * `resolveWalletSection` decides WHICH state the screen is in (unit-tested in
 * lib/__tests__/wallet-section-state.test.ts); this pins that the screen
 * renders the matching thing, which is where the reported bug actually showed:
 * with a linked wallet and an unloaded chain registry the screen rendered the
 * hero — an authoritative `0.00 USDC` — over no rows at all.
 *
 * The screen is mocked down to its shell; only the wallet section's own pieces
 * are stubbed with testIDs so each branch is observable.
 */
import { render, screen, fireEvent } from '@testing-library/react-native'
import type { UserEscrowTransaction, WalletSectionState } from '@tenda/shared'

/** Only the fields the screen's rows actually touch. */
const tx = (id: string): UserEscrowTransaction =>
  ({ id, created_at: '2026-07-17T10:00:00.000Z' }) as UserEscrowTransaction

const mockRetryWallets = jest.fn()
const mockRetryChains = jest.fn()
let mockSection: WalletSectionState = 'ready'
const mockGasClaimOptions: unknown[] = []
/** The hook's own feed type, so the fixture cannot drift from groupByDay's
 *  output (it carries a `tag` a hand-written row would have missed). */
type FeedRow = ReturnType<typeof import('@/hooks/useWalletScreen').useWalletScreen>['feed'][number]
let mockFeed: FeedRow[] = []
let mockIsLoadingTransactions = false
let mockTotalUsdc: number | null = 0
let mockRates: Record<string, number> | null = null
let mockCurrency = 'NGN'

// Typed against the REAL return shape: an untyped stand-in would keep passing
// while the hook's contract moved underneath it, and this suite is the only
// thing checking that the screen renders the right branch for each state.
jest.mock('@/hooks/useWalletScreen', () => ({
  useWalletScreen: (): ReturnType<typeof import('@/hooks/useWalletScreen').useWalletScreen> => ({
    user: { id: 'u1' } as ReturnType<typeof import('@/hooks/useWalletScreen').useWalletScreen>['user'],
    section: mockSection,
    retryWallets: mockRetryWallets,
    retryChains: mockRetryChains,
    balances: [],
    totalUsdc: mockTotalUsdc,
    usdcAssetId: 'USDC_SOL',
    earnedUsdc: 0,
    spentUsdc: 0,
    feed: mockFeed,
    loadMoreTransactions: jest.fn(),
    isLoadingMoreTransactions: false,
    isLoading: false,
    isLoadingTransactions: mockIsLoadingTransactions,
    refreshing: false,
    handleRefresh: jest.fn(),
  }),
}))

// The two stores the fiat line reads. Selector-style stand-ins over the test's own state.
jest.mock('@/stores/exchange-rate.store', () => ({
  useExchangeRateStore: (sel: (s: { rates: Record<string, number> | null }) => unknown) => sel({ rates: mockRates }),
}))
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: (sel: (s: { currency: string }) => unknown) => sel({ currency: mockCurrency }),
}))

jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: { colors: { brand: { primary: '#50f' }, content: { tertiary: '#999' } } },
  }),
}))
jest.mock('@/components/ui', () => {
  const { View, Text } = require('react-native')
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Header: () => null,
    Spacer: () => null,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  }
})
// The gas claim mounts here now (#53c-2) and fetches availability on mount.
// Stubbed to render nothing: this suite is about which WALLET section shows,
// and an unstubbed fetch would make the screen's test depend on a network call
// failing — plus it settles after the test ends, which is what produced
// "update not wrapped in act" noise across every case in the file.
jest.mock('@/features/gas-claim', () => ({
  // Returns a RENDERER, matching the real hook's shape (#100) — a mock that
  // returned a component would let the screen compile against a contract the
  // feature no longer has.
  //
  // CAPTURES its argument. A mock that ignored it made the screen's `enabled`
  // wiring unfalsifiable: a mutation replacing `section === 'ready'` with a bare
  // `true` passed every test in this file, which is exactly the regression
  // #100's audit had just fixed.
  useGasClaimChip: (opts: unknown) => {
    mockGasClaimOptions.push(opts)
    return () => null
  },
}))
jest.mock('@/components/reputation', () => ({ RestrictionBanner: () => null }))
jest.mock('@/components/sync/FailedSyncPanel', () => ({ FailedSyncPanel: () => null }))
jest.mock('@/components/wallet', () => {
  const { View, Pressable, Text } = require('react-native')
  return {
    TxRow: ({ userId }: { userId: string }) => <View testID={`tx-row-${userId}`} />,
    WalletHeroCard: ({ isLoading, fiatLine }: { isLoading: boolean; fiatLine?: string | null }) => (
      <View testID={isLoading ? 'hero-skeleton' : 'hero-amount'}>
        <Text testID="hero-fiat-line">{fiatLine === null || fiatLine === undefined ? 'none' : fiatLine}</Text>
      </View>
    ),
    WalletBalanceRows: () => <View testID="balance-rows" />,
    WalletActions: () => <View testID="wallet-actions" />,
    EarningsSummary: () => <View testID="earnings" />,
    WalletEmptyState: () => <View testID="no-wallet" />,
    WalletLoadError: ({ variant, onRetry }: { variant?: string; onRetry: () => void }) => (
      <Pressable testID={`load-error-${variant ?? 'wallets'}`} onPress={onRetry}>
        <Text>retry</Text>
      </Pressable>
    ),
  }
})

import WalletScreen from '@/app/(tabs)/wallet'

beforeEach(() => {
  mockSection = 'ready'
  mockFeed = []
  mockIsLoadingTransactions = false
  mockTotalUsdc = 0
  mockRates = null
  mockCurrency = 'NGN'
  mockRetryWallets.mockClear()
  mockRetryChains.mockClear()
})

test('ready → the balance hero, the per-chain rows, actions and earnings', () => {
  render(<WalletScreen />)

  expect(screen.getByTestId('hero-amount')).toBeTruthy()
  expect(screen.getByTestId('balance-rows')).toBeTruthy()
  expect(screen.getByTestId('wallet-actions')).toBeTruthy()
  expect(screen.getByTestId('earnings')).toBeTruthy()
})

test('the hero is handed a naira line priced through the USD leg of the cached rates', () => {
  mockTotalUsdc = 100
  mockRates = { USD: 1, NGN: 1500 }
  render(<WalletScreen />)
  expect(screen.getByTestId('hero-fiat-line').props.children).toBe('≈ ₦150,000')
})

test('no cached rates, or a missing USD leg → NO fiat line rather than a stale or invented one', () => {
  mockTotalUsdc = 100
  mockRates = null
  const { rerender } = render(<WalletScreen />)
  expect(screen.getByTestId('hero-fiat-line').props.children).toBe('none')
  mockRates = { NGN: 1500 }
  rerender(<WalletScreen />)
  expect(screen.getByTestId('hero-fiat-line').props.children).toBe('none')
})

test('a total the build cannot scale gets no fiat line either', () => {
  mockTotalUsdc = null
  mockRates = { USD: 1, NGN: 1500 }
  render(<WalletScreen />)
  expect(screen.getByTestId('hero-fiat-line').props.children).toBe('none')
})

test('balances-unavailable → the balances error INSTEAD of a 0.00 hero', () => {
  mockSection = 'balances-unavailable'

  render(<WalletScreen />)

  expect(screen.getByTestId('load-error-balances')).toBeTruthy()
  // The bug, pinned: no headline figure and no rows may be shown when the
  // registry could not be read — a zero here is a claim we cannot support.
  expect(screen.queryByTestId('hero-amount')).toBeNull()
  expect(screen.queryByTestId('hero-skeleton')).toBeNull()
  expect(screen.queryByTestId('balance-rows')).toBeNull()
})

test('balances-unavailable keeps the lifetime totals, which owe nothing to the registry', () => {
  mockSection = 'balances-unavailable'

  render(<WalletScreen />)

  // Server-computed from /transactions/summary — withholding them would
  // overstate the outage.
  expect(screen.getByTestId('earnings')).toBeTruthy()
})

test('balances-unavailable withholds Sell / cash-out, which needs the same registry', () => {
  mockSection = 'balances-unavailable'

  render(<WalletScreen />)

  // useExchangeAssetOptions derives the sellable (chain, asset) pairs from the
  // registry and returns [] without it, so the button would open an empty
  // picker — a dead end dressed up as an available action.
  expect(screen.queryByTestId('wallet-actions')).toBeNull()
})

test('balances-unavailable retries the REGISTRY, not the wallet list', () => {
  mockSection = 'balances-unavailable'
  render(<WalletScreen />)

  fireEvent.press(screen.getByTestId('load-error-balances'))

  expect(mockRetryChains).toHaveBeenCalledTimes(1)
  expect(mockRetryWallets).not.toHaveBeenCalled()
})

test('wallets-error → the wallets error, retrying the wallet list', () => {
  mockSection = 'wallets-error'
  render(<WalletScreen />)

  fireEvent.press(screen.getByTestId('load-error-wallets'))

  expect(mockRetryWallets).toHaveBeenCalledTimes(1)
  expect(mockRetryChains).not.toHaveBeenCalled()
  expect(screen.queryByTestId('no-wallet')).toBeNull()
})

test('no-wallet → the link-a-wallet empty state', () => {
  mockSection = 'no-wallet'

  render(<WalletScreen />)

  expect(screen.getByTestId('no-wallet')).toBeTruthy()
  expect(screen.queryByTestId('hero-amount')).toBeNull()
})

test('loading → the hero SKELETON, never the empty state or a zero figure', () => {
  mockSection = 'loading'

  render(<WalletScreen />)

  expect(screen.getByTestId('hero-skeleton')).toBeTruthy()
  expect(screen.queryByTestId('no-wallet')).toBeNull()
  expect(screen.queryByTestId('hero-amount')).toBeNull()
})

// ─── the transaction feed beneath the section ─────────────────────────────────

test('renders day dividers and rows, passing the user id each row needs', () => {
  mockFeed = [
    { type: 'day', key: 'd-2026-07-17', label: 'Today', tag: 'tx' },
    { type: 'item', key: 't1', item: tx('t1'), tag: 'tx' },
  ]

  render(<WalletScreen />)

  expect(screen.getByText('TODAY')).toBeTruthy() // dividers are upper-cased
  // TxRow decides "sent" vs "received" from this — an empty id would silently
  // render every row from the wrong side.
  expect(screen.getByTestId('tx-row-u1')).toBeTruthy()
})

test('an empty feed says so only once it has finished loading', () => {
  mockFeed = []
  mockIsLoadingTransactions = true

  const { rerender } = render(<WalletScreen />)
  // Declaring "none" over a request still in flight is the flash this guards.
  expect(screen.queryByText('No transactions yet')).toBeNull()

  mockIsLoadingTransactions = false
  rerender(<WalletScreen />)
  expect(screen.getByText('No transactions yet')).toBeTruthy()
})

/**
 * The gas claim is read only when there are rows to offer it on (#100 audit C10).
 *
 * `useGasClaimChip` is a hook, so the screen must call it unconditionally — which
 * means the ONLY thing standing between a no-wallet user and a pointless
 * availability round trip is the `enabled` argument. That argument had no test:
 * replacing it with a bare `true` passed this whole file.
 */
test.each([
  ['ready' as const, true],
  ['no-wallet' as const, false],
  ['wallets-error' as const, false],
  ['balances-unavailable' as const, false],
])('section %s → the gas claim read is enabled=%s', (section, expected) => {
  mockGasClaimOptions.length = 0
  mockSection = section
  render(<WalletScreen />)
  expect(mockGasClaimOptions[0]).toEqual({ enabled: expected })
})
