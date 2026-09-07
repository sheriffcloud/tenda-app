/**
 * useWalletScreen, multichain data controller. Asserts the no-wallet loading
 * fix (isLoading must SETTLE, not strand the skeleton, when no wallet is linked
 *, the old hook early-returned and looped forever) and the USDC-total wiring.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'

type Chain = { id: string; namespace: string; display_name: string; assets: unknown[] }

let mockUser: { id: string } | null = { id: 'u1' }
let mockWallets: Array<{ chain_ns: string; address: string }> = []
let mockWalletsStatus = 'ready'
const mockRetry = jest.fn()
let mockChains: Chain[] | null = []
let mockChainsStatus = 'ready'
// The two upstream refetches the screen now drives itself. Both are store
// actions in real life (stable identities) — the mocks must be stable too, or
// the focus effect they live in would re-fire on every render and the
// "fires once per focus" assertions would be meaningless.
const mockRefreshMe = jest.fn(() => Promise.resolve())
const mockEnsureChains = jest.fn(() => Promise.resolve())
// Both stores are mocked WITH `getState`, as zustand really exposes it: the
// refresh path reads the just-settled values that way, and a selector-only
// stand-in would silently hand it `undefined`.
jest.mock('@/stores/auth.store', () => {
  const authState = () => ({
    user: mockUser,
    wallets: mockWallets,
    walletsStatus: mockWalletsStatus,
    retryWalletSync: mockRetry,
    refreshMe: mockRefreshMe,
  })
  return {
    useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel(authState()), {
      getState: authState,
    }),
  }
})
jest.mock('@/stores/chain-registry.store', () => {
  const registryState = () => ({
    chains: mockChains,
    status: mockChainsStatus,
    ensureLoaded: mockEnsureChains,
  })
  return {
    // The REAL predicate, not a re-implementation: "usable" is the rule that
    // decides whether balances can be read at all, and a copy of it here could
    // drift from the store's without any test noticing.
    isRegistryUsable: jest.requireActual<typeof import('@/stores/chain-registry.store')>(
      '@/stores/chain-registry.store',
    ).isRegistryUsable,
    useChainRegistryStore: Object.assign((sel: (s: unknown) => unknown) => sel(registryState()), {
      getState: registryState,
    }),
  }
})

const mockRead = jest.fn((_wallets?: unknown, _chains?: unknown) => Promise.resolve([] as unknown[]))
const mockSum = jest.fn((_balances?: unknown) => '0')
jest.mock('@/wallet/balances', () => ({
  readWalletBalances: (wallets: unknown, chains: unknown) => mockRead(wallets, chains),
  sumUsdcRaw: (balances: unknown) => mockSum(balances),
}))
/** One page of the transaction feed, as the wire delivers it. */
type TxPage = { data: unknown[]; total: number; limit: number; offset: number }
const mockTxns = jest.fn((_args?: unknown, _query?: unknown): Promise<TxPage> =>
  Promise.resolve({ data: [], total: 0, limit: 20, offset: 0 }))
const mockSummary = jest.fn((_args?: unknown) =>
  Promise.resolve({ earned_raw: '0', spent_raw: '0', asset: 'USDC_SOL' }))
jest.mock('@/api/client', () => ({
  api: {
    users: {
      transactions: (args: unknown, query: unknown) => mockTxns(args, query),
      transactionsSummary: (args: unknown) => mockSummary(args),
    },
  },
}))
// Focus fires once on mount and again on demand — a tab screen stays mounted,
// so "what happens on the SECOND focus" is real behaviour, not a corner case.
jest.mock('expo-router', () => {
  const React = require('react')
  const { registerFocus } = require('@/hooks/__fixtures__/focus')
  return { useFocusEffect: (cb: () => void) => React.useEffect(() => registerFocus(cb), [cb]) }
})

import { useWalletScreen } from '@/hooks/useWalletScreen'
import { refocus, resetFocus } from '@/hooks/__fixtures__/focus'

afterEach(() => resetFocus())

/** A registry a balance read can actually use (non-empty). */
const CHAINS: Chain[] = [
  { id: 'solana:devnet', namespace: 'solana', display_name: 'Solana', assets: [] },
]

beforeEach(() => {
  mockUser = { id: 'u1' }
  mockWallets = []
  mockWalletsStatus = 'ready'
  mockRetry.mockReset()
  mockChains = CHAINS
  mockChainsStatus = 'ready'
  mockRefreshMe.mockClear()
  mockEnsureChains.mockClear()
  mockRead.mockReset().mockResolvedValue([])
  mockSum.mockReset().mockReturnValue('0')
  mockTxns.mockReset().mockResolvedValue({ data: [], total: 0, limit: 20, offset: 0 })
  mockSummary.mockReset().mockResolvedValue({ earned_raw: '0', spent_raw: '0', asset: 'USDC_SOL' })
})

test('no wallet linked → the no-wallet section and isLoading SETTLES (no infinite skeleton)', async () => {
  const { result } = renderHook(() => useWalletScreen())
  expect(result.current.section).toBe('no-wallet')
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  // It still attempts a read (with an empty wallet list) rather than early-returning.
  expect(mockRead).toHaveBeenCalledWith([], CHAINS)
})

test('with a wallet → reads balances and derives the USDC headline total', async () => {
  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  mockChains = [{ id: 'solana:devnet', namespace: 'solana', display_name: 'Solana', assets: [] }]
  mockRead.mockResolvedValue([
    { chainId: 'solana:devnet', namespace: 'solana', displayName: 'Solana', address: 'SoL',
      usdc: { assetId: 'USDC_SOL', symbol: 'USDC', amountRaw: '50000000', decimals: 6, isStable: true }, native: null },
  ])
  mockSum.mockReturnValue('50000000') // 50 USDC (6dp)

  const { result } = renderHook(() => useWalletScreen())
  expect(result.current.section).toBe('ready')
  await waitFor(() => expect(result.current.balances).toHaveLength(1))
  expect(result.current.totalUsdc).toBe(50)
})

test('surfaces the failed-load section and its retry, so the screen can distinguish load states', async () => {
  mockWalletsStatus = 'error'
  const { result } = renderHook(() => useWalletScreen())
  expect(result.current.section).toBe('wallets-error')
  expect(result.current.retryWallets).toBe(mockRetry)
  await waitFor(() => expect(result.current.isLoading).toBe(false)) // settle the load effect
})

// ─── lifetime totals (open_issues MB1) ────────────────────────────────────────
// The earned/spent RULES (which tx types count, whose side, skipping unattested
// amounts, no double fee subtraction) are now a SQL aggregate and are pinned in
// apps/server/test/integration/transactions-summary.test.ts. What belongs here
// is that the hook reads that aggregate rather than reducing the feed.

test('lifetime totals come from the summary endpoint, not from the loaded page', async () => {
  // A page holding one small row, against a much larger lifetime total: if the
  // hook were still reducing the feed it could only ever report the page.
  mockTxns.mockResolvedValue({
    data: [{ id: 't1', created_at: '2026-07-17T10:00:00.000Z' }],
    total: 500,
    limit: 20,
    offset: 0,
  })
  mockSummary.mockResolvedValue({ earned_raw: '1980000', spent_raw: '2000000', asset: 'USDC_SOL' })

  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.earnedUsdc).toBeCloseTo(1.98, 6))
  expect(result.current.spentUsdc).toBeCloseTo(2, 6)
  expect(mockSummary).toHaveBeenCalledWith({ id: 'u1' })
})

test('converts raw base units using the asset the server names', async () => {
  mockSummary.mockResolvedValue({ earned_raw: '12345678', spent_raw: '0', asset: 'USDC_SOL' })
  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.earnedUsdc).toBeCloseTo(12.345678, 6))
})

test('a failed summary keeps the last totals rather than flashing zeroes', async () => {
  mockSummary.mockResolvedValue({ earned_raw: '5000000', spent_raw: '0', asset: 'USDC_SOL' })
  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.earnedUsdc).toBeCloseTo(5, 6))

  mockSummary.mockRejectedValue(new Error('offline'))
  await act(async () => { await result.current.handleRefresh() })
  // Zeroes here would read as "you have earned nothing".
  expect(result.current.earnedUsdc).toBeCloseTo(5, 6)
})

test('no summary request without a user id', async () => {
  mockUser = null
  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(mockSummary).not.toHaveBeenCalled()
  expect(mockTxns).not.toHaveBeenCalled()
})

// ─── paginated feed ───────────────────────────────────────────────────────────

test('the transaction feed is paginated and day-grouped', async () => {
  mockTxns.mockResolvedValueOnce({
    data: [{ id: 't1', created_at: '2026-07-17T10:00:00.000Z' }],
    total: 2,
    limit: 20,
    offset: 0,
  })
  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.feed.length).toBeGreaterThan(0))
  // groupByDay inserts a day divider ahead of the row.
  expect(result.current.feed.some((f) => f.type === 'day')).toBe(true)

  mockTxns.mockResolvedValueOnce({
    data: [{ id: 't2', created_at: '2026-07-18T10:00:00.000Z' }],
    total: 2,
    limit: 20,
    offset: 1,
  })
  act(() => result.current.loadMoreTransactions())
  await waitFor(() =>
    expect(result.current.feed.filter((f) => f.type === 'item')).toHaveLength(2),
  )
})

test('a later focus re-reads the feed, so the list cannot go stale beside fresh totals', async () => {
  renderHook(() => useWalletScreen())
  await waitFor(() => expect(mockTxns).toHaveBeenCalledTimes(1))
  const summaryCallsAfterMount = mockSummary.mock.calls.length

  // Returning to the tab after approving an escrow: the wallet stays mounted,
  // so without an explicit re-read the EARNED card refreshed while TRANSACTION
  // HISTORY kept showing the pre-approval list.
  await act(async () => { refocus() })
  await waitFor(() => expect(mockTxns).toHaveBeenCalledTimes(2))
  expect(mockSummary.mock.calls.length).toBeGreaterThan(summaryCallsAfterMount)
  // The re-read is page 0, and `reload` keeps whatever pages were scrolled.
  expect(mockTxns.mock.calls[1][1]).toEqual(expect.objectContaining({ offset: 0 }))
})

test('the FIRST focus does not double-fetch the feed', async () => {
  // The controller's query effect already owns page 0 on mount; a focus effect
  // that fetched unconditionally would make every cold open two requests.
  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  await waitFor(() => expect(mockTxns).toHaveBeenCalledTimes(1))

  await new Promise((r) => setTimeout(r, 20))
  expect(mockTxns).toHaveBeenCalledTimes(1)
})

test('a focus while the feed is gated off does not fire an id-less request', async () => {
  mockUser = null
  renderHook(() => useWalletScreen())
  await act(async () => { refocus() })
  // `enabled` is false, so there is no fetched page to re-read — and calling
  // reload() anyway would request `/users//transactions`.
  expect(mockTxns).not.toHaveBeenCalled()
})

test('the feed has its own loading flag, so the empty state cannot fire early', async () => {
  // The summary is the cheaper query and routinely settles first. Sharing one
  // `isLoading` flashed "No transactions yet" over a feed still in flight.
  let resolveFeed: ((page: TxPage) => void) | undefined
  mockTxns.mockImplementation(() => new Promise<TxPage>((res) => { resolveFeed = res }))

  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.isLoadingTransactions).toBe(true)

  await act(async () => {
    resolveFeed?.({ data: [], total: 0, limit: 20, offset: 0 })
  })
  expect(result.current.isLoadingTransactions).toBe(false)
})

test('the feed is NOT loading when it will never fetch, so the empty state still shows', async () => {
  mockUser = null
  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.isLoadingTransactions).toBe(false)
})

test('pull-to-refresh keeps spinning until the FEED lands, not just the totals', async () => {
  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  let resolveFeed: ((page: TxPage) => void) | undefined
  mockTxns.mockImplementation(() => new Promise<TxPage>((res) => { resolveFeed = res }))

  let refreshed: Promise<void> | undefined
  await act(async () => {
    refreshed = result.current.handleRefresh()
    // Let the balances + summary half settle on its own.
    await Promise.resolve()
  })
  await waitFor(() => expect(result.current.refreshing).toBe(true))

  await act(async () => {
    resolveFeed?.({ data: [], total: 0, limit: 20, offset: 0 })
    await refreshed
  })
  expect(result.current.refreshing).toBe(false)
})

test('signed out → totals reset to zero rather than keeping the previous account', async () => {
  mockUser = null
  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.earnedUsdc).toBe(0)
  expect(result.current.spentUsdc).toBe(0)
})

test('a failed balance read empties balances without wedging the screen', async () => {
  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  mockRead.mockRejectedValue(new Error('rpc down'))
  mockSummary.mockResolvedValue({ earned_raw: '3000000', spent_raw: '0', asset: 'USDC_SOL' })

  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.balances).toEqual([])
  // The other half of the screen still loaded — that is what allSettled buys.
  expect(result.current.earnedUsdc).toBeCloseTo(3, 6)
})

test('an unloaded chain registry reads as no chains rather than throwing', async () => {
  mockChains = null
  mockChainsStatus = 'loading'
  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(mockRead).toHaveBeenCalledWith(mockWallets, [])
})

// ─── the chain registry: the session-sticky `0.00` bug ────────────────────────
// Verified cause of "the wallet screen shows 0.00 with no rows until I force
// close the app": the registry is fetched ONCE at launch (useAppReady), its
// failure is swallowed, and nothing retried it. `readWalletBalances` pairs each
// wallet against the chains sharing its namespace, so zero chains means zero
// pairs — which the screen rendered as a settled, authoritative zero balance.

test('a linked wallet with an unusable registry reports balances-unavailable, NOT a zero balance', async () => {
  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  mockChains = null
  mockChainsStatus = 'error'

  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  expect(result.current.section).toBe('balances-unavailable')
})

test('a registry still in flight reads as loading, so no retry is offered prematurely', async () => {
  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  mockChains = null
  mockChainsStatus = 'loading'

  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  expect(result.current.section).toBe('loading')
})

test('an EMPTY registry is not mistaken for a loaded one', async () => {
  // `chains ?? []` made null and [] identical downstream; only the emptiness
  // check separates "nothing enabled / nothing fetched" from a real zero.
  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  mockChains = []
  mockChainsStatus = 'error'

  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  expect(result.current.section).toBe('balances-unavailable')
})

test('every focus re-resolves BOTH upstream loads, so the screen self-heals', async () => {
  // Re-entering the tab used to change nothing: the focus effect only re-read
  // balances, against the same stale wallets and the same unloaded registry.
  renderHook(() => useWalletScreen())
  await waitFor(() => expect(mockRefreshMe).toHaveBeenCalledTimes(1))
  expect(mockEnsureChains).toHaveBeenCalledTimes(1)

  await act(async () => { refocus() })

  expect(mockRefreshMe).toHaveBeenCalledTimes(2)
  expect(mockEnsureChains).toHaveBeenCalledTimes(2)
})

test('the upstream refetch does NOT re-trigger itself when the wallet list changes', async () => {
  // The loop this guards: refreshMe rewrites wallets[] with a fresh array →
  // `load`'s identity changes → an effect holding both would re-run → refreshMe
  // again, forever. The upstream effect must depend only on stable actions.
  const { rerender } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(mockRefreshMe).toHaveBeenCalledTimes(1))

  // Exactly what a settled refreshMe does: a NEW array, same content.
  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  await act(async () => { rerender({}) })
  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  await act(async () => { rerender({}) })

  expect(mockRefreshMe).toHaveBeenCalledTimes(1)
  expect(mockEnsureChains).toHaveBeenCalledTimes(1)
})

test('a slower EARLIER read cannot overwrite the newer one it was superseded by', async () => {
  // Reachable now that the inputs change mid-flight: unlinking a wallet re-fires
  // the read while the previous one is still out. Without a run guard the older,
  // slower answer lands last — showing balances for a wallet list the user has
  // already moved on from.
  const row = (address: string) => ({
    chainId: 'solana:devnet', namespace: 'solana', displayName: 'Solana', address,
    usdc: { assetId: 'USDC_SOL', symbol: 'USDC', amountRaw: '1', decimals: 6, isStable: true },
    native: null,
  })
  let releaseFirst: ((v: unknown[]) => void) | undefined
  mockRead.mockImplementationOnce(() => new Promise<unknown[]>((res) => { releaseFirst = res }))

  mockWallets = [{ chain_ns: 'solana', address: 'OLD' }]
  const { result, rerender } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(1))

  // The list changes → a second read starts and lands first.
  mockRead.mockResolvedValue([row('NEW')])
  mockWallets = [{ chain_ns: 'solana', address: 'NEW' }]
  await act(async () => { rerender({}) })
  await waitFor(() => expect(result.current.balances).toEqual([row('NEW')]))

  // Only now does the superseded read answer, with the OLD wallet's balances.
  await act(async () => { releaseFirst?.([row('OLD')]) })

  expect(result.current.balances).toEqual([row('NEW')])
})

test('a superseded run cannot write even when it FAILS or answers late', async () => {
  // The other half of the guard: an overtaken read that rejects must not blank
  // the newer balances, and an overtaken summary must not restore old totals.
  let failFirst: ((e: Error) => void) | undefined
  let resolveFirstSummary: ((v: { earned_raw: string; spent_raw: string; asset: string }) => void) | undefined
  mockRead.mockImplementationOnce(() => new Promise<unknown[]>((_, rej) => { failFirst = rej }))
  mockSummary.mockImplementationOnce(() => new Promise((res) => { resolveFirstSummary = res }))

  mockWallets = [{ chain_ns: 'solana', address: 'OLD' }]
  const { result, rerender } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(1))

  const fresh = [{ chainId: 'solana:devnet', namespace: 'solana', displayName: 'Solana',
    address: 'NEW', usdc: null, native: null }]
  mockRead.mockResolvedValue(fresh)
  mockSummary.mockResolvedValue({ earned_raw: '9000000', spent_raw: '0', asset: 'USDC_SOL' })
  mockWallets = [{ chain_ns: 'solana', address: 'NEW' }]
  await act(async () => { rerender({}) })
  await waitFor(() => expect(result.current.earnedUsdc).toBeCloseTo(9, 6))

  await act(async () => {
    failFirst?.(new Error('rpc down'))
    resolveFirstSummary?.({ earned_raw: '1000000', spent_raw: '0', asset: 'USDC_SOL' })
  })

  expect(result.current.balances).toEqual(fresh)
  expect(result.current.earnedUsdc).toBeCloseTo(9, 6)
})

test('a superseded read still settles its own loading flag', async () => {
  // The guard covers the DATA writes only; guarding the flags too would strand
  // whichever one the overtaken run had raised.
  let releaseFirst: ((v: unknown[]) => void) | undefined
  mockRead.mockImplementationOnce(() => new Promise<unknown[]>((res) => { releaseFirst = res }))

  mockWallets = [{ chain_ns: 'solana', address: 'OLD' }]
  const { result, rerender } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(1))

  mockRead.mockResolvedValue([])
  mockWallets = [{ chain_ns: 'solana', address: 'NEW' }]
  await act(async () => { rerender({}) })
  await act(async () => { releaseFirst?.([]) })

  expect(result.current.isLoading).toBe(false)
  expect(result.current.refreshing).toBe(false)
})

test('an unchanged wallet list does not cost a second balance read per focus', async () => {
  // refreshMe now runs on EVERY focus. It hands back the same array identity
  // when the list did not move (reconcileWalletState), so this effect must not
  // re-run — otherwise each visit would read every balance over RPC twice.
  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  const { rerender } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(1))

  await act(async () => { rerender({}) })
  await act(async () => { rerender({}) })

  expect(mockRead).toHaveBeenCalledTimes(1)
})

test('a settled wallet list re-reads balances without re-fetching the feed', async () => {
  // The other half of the same split: the feed reload belongs to real focuses
  // only. Attached to `load`, every refreshMe would fire a pointless page 0.
  const { rerender } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(mockTxns).toHaveBeenCalledTimes(1))
  const readsBefore = mockRead.mock.calls.length

  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  await act(async () => { rerender({}) })

  expect(mockRead.mock.calls.length).toBeGreaterThan(readsBefore)
  expect(mockRead).toHaveBeenLastCalledWith(mockWallets, CHAINS)
  expect(mockTxns).toHaveBeenCalledTimes(1)
})

test('pull-to-refresh recovers a failed registry and re-reads against the new chains', async () => {
  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  mockChains = null
  mockChainsStatus = 'error'

  const { result, rerender } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.section).toBe('balances-unavailable'))

  // The gesture the user actually reaches for: it must drive the recovery,
  // not just re-read balances against the same broken inputs.
  mockEnsureChains.mockImplementation(() => {
    mockChains = CHAINS
    mockChainsStatus = 'ready'
    return Promise.resolve()
  })
  await act(async () => { await result.current.handleRefresh() })
  await act(async () => { rerender({}) })

  expect(mockEnsureChains).toHaveBeenCalled()
  expect(mockRefreshMe).toHaveBeenCalled()
  await waitFor(() => expect(result.current.section).toBe('ready'))
  expect(mockRead).toHaveBeenLastCalledWith(mockWallets, CHAINS)
})

test('exposes the registry retry so the error card can recover in place', async () => {
  mockWallets = [{ chain_ns: 'solana', address: 'SoL' }]
  mockChains = null
  mockChainsStatus = 'error'

  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  expect(result.current.retryChains).toBe(mockEnsureChains)
})

test('section reports the wallet-level state ahead of any registry problem', async () => {
  // No wallet linked → a registry failure is not yet the user's problem.
  mockWallets = []
  mockWalletsStatus = 'ready'
  mockChains = null
  mockChainsStatus = 'error'

  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  expect(result.current.section).toBe('no-wallet')
})

test('a failed wallets load outranks a healthy registry', async () => {
  mockWallets = []
  mockWalletsStatus = 'error'

  const { result } = renderHook(() => useWalletScreen())
  await waitFor(() => expect(result.current.isLoading).toBe(false))

  expect(result.current.section).toBe('wallets-error')
  expect(result.current.retryWallets).toBe(mockRetry)
})
