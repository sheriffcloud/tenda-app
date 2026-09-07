/**
 * useExchangeScreen — the Trade screen's two independent lists. Pins that the
 * chain filter reaches both, that the currency filter stays scoped to the
 * order book, that "My Trades" never fires without a user id, and that a later
 * focus re-reads both without double-fetching the first one.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'

const mockExchangeList = jest.fn()
const mockUserEscrows = jest.fn()
jest.mock('@/api/client', () => ({
  api: {
    exchange: { list: (...a: unknown[]) => mockExchangeList(...a) },
    users: { escrows: (...a: unknown[]) => mockUserEscrows(...a) },
  },
}))

const mockUser = jest.fn()
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: mockUser() }),
}))

// Focus fires on mount and again on demand — Trade is a tab, so the SECOND
// focus is the case that matters.
jest.mock('expo-router', () => {
  const React = require('react')
  const { registerFocus } = require('@/hooks/__fixtures__/focus')
  return { useFocusEffect: (cb: () => void) => React.useEffect(() => registerFocus(cb), [cb]) }
})

import { useExchangeScreen } from '@/hooks/useExchangeScreen'
import { refocus, resetFocus } from '@/hooks/__fixtures__/focus'

afterEach(() => resetFocus())

const offerPage = { data: [{ escrow_id: 'o1' }], total: 1, limit: 20, offset: 0 }
const escrowPage = { data: [{ id: 'e1' }], total: 1, limit: 20, offset: 0 }

beforeEach(() => {
  mockExchangeList.mockReset().mockResolvedValue(offerPage)
  mockUserEscrows.mockReset().mockResolvedValue(escrowPage)
  mockUser.mockReturnValue({ id: 'user-1' })
})

test('loads the order book and my trades independently on mount', async () => {
  renderHook(() => useExchangeScreen())
  await waitFor(() => expect(mockExchangeList).toHaveBeenCalledTimes(1))
  expect(mockUserEscrows).toHaveBeenCalledTimes(1)
  // My Trades is scoped to exchange escrows, both sides (no role filter).
  expect(mockUserEscrows).toHaveBeenCalledWith(
    { id: 'user-1' },
    expect.objectContaining({ kind: 'exchange' }),
  )
})

test('the chain filter reaches BOTH lists', async () => {
  const { result } = renderHook(() => useExchangeScreen())
  await waitFor(() => expect(mockExchangeList).toHaveBeenCalledTimes(1))

  act(() => result.current.setChainId('eip155:84532'))
  await waitFor(() => expect(mockExchangeList).toHaveBeenCalledTimes(2))
  expect(mockExchangeList).toHaveBeenLastCalledWith(
    expect.objectContaining({ chain_id: 'eip155:84532', offset: 0 }),
  )
  await waitFor(() =>
    expect(mockUserEscrows).toHaveBeenLastCalledWith(
      { id: 'user-1' },
      expect.objectContaining({ chain_id: 'eip155:84532' }),
    ),
  )
})

test('the currency filter applies to the order book only', async () => {
  const { result } = renderHook(() => useExchangeScreen())
  await waitFor(() => expect(mockExchangeList).toHaveBeenCalledTimes(1))
  const tradesCallsBefore = mockUserEscrows.mock.calls.length

  act(() => result.current.setCurrency('NGN'))
  await waitFor(() =>
    expect(mockExchangeList).toHaveBeenLastCalledWith(expect.objectContaining({ currency: 'NGN' })),
  )
  // A fiat currency has no meaning for the escrow list — it must not refetch.
  expect(mockUserEscrows).toHaveBeenCalledTimes(tradesCallsBefore)
})

test('clearFilters drops both filters', async () => {
  const { result } = renderHook(() => useExchangeScreen())
  await waitFor(() => expect(mockExchangeList).toHaveBeenCalledTimes(1))

  act(() => result.current.setCurrency('NGN'))
  act(() => result.current.setChainId('solana:devnet'))
  await waitFor(() =>
    expect(mockExchangeList).toHaveBeenLastCalledWith(
      expect.objectContaining({ currency: 'NGN', chain_id: 'solana:devnet' }),
    ),
  )

  act(() => result.current.clearFilters())
  await waitFor(() =>
    expect(mockExchangeList).toHaveBeenLastCalledWith(
      expect.objectContaining({ currency: undefined, chain_id: undefined }),
    ),
  )
  expect(result.current.currency).toBeNull()
  expect(result.current.chainId).toBeNull()
})

test('my trades never requests without a user id', async () => {
  mockUser.mockReturnValue(null)
  const { result } = renderHook(() => useExchangeScreen())
  await waitFor(() => expect(mockExchangeList).toHaveBeenCalledTimes(1))
  // Firing with an empty id would 403 on someone else's escrows.
  expect(mockUserEscrows).not.toHaveBeenCalled()
  expect(result.current.myTrades.hasFetched).toBe(false)
})

test('the order book still loads for a signed-out-ish state', async () => {
  mockUser.mockReturnValue(null)
  renderHook(() => useExchangeScreen())
  await waitFor(() => expect(mockExchangeList).toHaveBeenCalledTimes(1))
})

test('a later focus re-reads BOTH lists, so neither can serve pre-action state', async () => {
  const { result } = renderHook(() => useExchangeScreen())
  await waitFor(() => expect(mockExchangeList).toHaveBeenCalledTimes(1))

  // Post an offer, then come back to the tab: the screen never unmounted, so
  // without this the order book and My Trades stayed on their mount snapshot.
  mockExchangeList.mockResolvedValue({
    data: [{ escrow_id: 'o1' }, { escrow_id: 'o2' }],
    total: 2,
    limit: 20,
    offset: 0,
  })
  await act(async () => { refocus() })

  await waitFor(() => expect(result.current.market.total).toBe(2))
  expect(mockExchangeList).toHaveBeenCalledTimes(2)
  expect(mockUserEscrows).toHaveBeenCalledTimes(2)
  // Both re-reads are page 0, and `reload` keeps whatever pages were scrolled.
  expect(mockExchangeList).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }))
  expect(mockUserEscrows).toHaveBeenLastCalledWith(
    { id: 'user-1' },
    expect.objectContaining({ offset: 0 }),
  )
})

test('the focus re-read is silent — no skeleton over a list already on screen', async () => {
  const { result } = renderHook(() => useExchangeScreen())
  await waitFor(() => expect(mockExchangeList).toHaveBeenCalledTimes(1))

  mockExchangeList.mockImplementation(() => new Promise(() => {})) // never settles
  await act(async () => { refocus() })
  // `reload`, not `refresh`/`initial`: rows and flags stay put while it runs.
  expect(result.current.market.isLoading).toBe(false)
  expect(result.current.market.isRefreshing).toBe(false)
  expect(result.current.market.items).toHaveLength(1)
})

test('the FIRST focus does not double-fetch either list', async () => {
  // Page 0 is owned by each controller's query effect. A focus effect that
  // fetched unconditionally would double every cold open — the exact
  // double-fetch this screen was cleaned of.
  renderHook(() => useExchangeScreen())
  await waitFor(() => expect(mockExchangeList).toHaveBeenCalledTimes(1))

  await new Promise((r) => setTimeout(r, 20))
  expect(mockExchangeList).toHaveBeenCalledTimes(1)
  expect(mockUserEscrows).toHaveBeenCalledTimes(1)
})

test('a focus re-reads the order book but still skips gated-off my trades', async () => {
  mockUser.mockReturnValue(null)
  renderHook(() => useExchangeScreen())
  await waitFor(() => expect(mockExchangeList).toHaveBeenCalledTimes(1))

  await act(async () => { refocus() })
  expect(mockExchangeList).toHaveBeenCalledTimes(2)
  // Nothing was ever fetched for My Trades, so there is nothing to re-read —
  // and reloading anyway would request `/users//escrows`.
  expect(mockUserEscrows).not.toHaveBeenCalled()
})

test('the order book paginates independently of my trades', async () => {
  mockExchangeList.mockReset()
  mockExchangeList.mockImplementation((q: { offset: number }) =>
    Promise.resolve(
      q.offset === 0
        ? { data: [{ escrow_id: 'o1' }], total: 2, limit: 20, offset: 0 }
        : { data: [{ escrow_id: 'o2' }], total: 2, limit: 20, offset: 1 },
    ),
  )
  const { result } = renderHook(() => useExchangeScreen())
  await waitFor(() => expect(result.current.market.items).toHaveLength(1))

  act(() => result.current.market.loadMore())
  await waitFor(() => expect(result.current.market.items).toHaveLength(2))
  expect(result.current.myTrades.items).toHaveLength(1)
})

test('my trades paginates independently of the order book', async () => {
  mockUserEscrows.mockReset()
  mockUserEscrows.mockImplementation((_p: unknown, q: { offset: number }) =>
    Promise.resolve(
      q.offset === 0
        ? { data: [{ id: 'e1' }], total: 2, limit: 20, offset: 0 }
        : { data: [{ id: 'e2' }], total: 2, limit: 20, offset: 1 },
    ),
  )
  const { result } = renderHook(() => useExchangeScreen())
  await waitFor(() => expect(result.current.myTrades.items).toHaveLength(1))

  act(() => result.current.myTrades.loadMore())
  await waitFor(() => expect(result.current.myTrades.items).toHaveLength(2))
  expect(result.current.myTrades.items.map((r) => r.id)).toEqual(['e1', 'e2'])
})
