/**
 * useHomeFeed — filter state → request params. The behaviours pinned here are
 * the ones that changed with pagination: search is SERVER-side (and debounced),
 * the chain filter reaches the API, and an unset filter sends no param at all.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'

const mockList = jest.fn()
jest.mock('@/api/client', () => ({ api: { gigs: { list: (...a: unknown[]) => mockList(...a) } } }))
// Polling is exercised in its own suite; keep it inert here.
jest.mock('@/hooks/useGigsFeedPolling', () => ({ useGigsFeedPolling: jest.fn() }))

import { useHomeFeed } from '@/hooks/useHomeFeed'
import { SEARCH_DEBOUNCE_MS } from '@/hooks/useDebouncedValue'

const onePage = { data: [{ escrow_id: 'g0' }], total: 1, limit: 20, offset: 0 }

beforeEach(() => {
  mockList.mockReset()
  mockList.mockResolvedValue(onePage)
})

test('the initial request carries pagination and no filter params', async () => {
  renderHook(() => useHomeFeed())
  await waitFor(() => expect(mockList).toHaveBeenCalled())
  // Every filter is undefined → the request serialiser omits it entirely.
  expect(mockList).toHaveBeenCalledWith({
    q: undefined,
    category: undefined,
    country: undefined,
    city: undefined,
    remote: undefined,
    cross_border: undefined,
    chain_id: undefined,
    limit: 20,
    offset: 0,
  })
})

test('the chain filter reaches the API as chain_id and resets to page 0', async () => {
  const { result } = renderHook(() => useHomeFeed())
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1))

  act(() => result.current.setFilter('chainId', 'eip155:84532'))
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  expect(mockList).toHaveBeenLastCalledWith(
    expect.objectContaining({ chain_id: 'eip155:84532', offset: 0 }),
  )
})

test('category and location filters reach the API', async () => {
  const { result } = renderHook(() => useHomeFeed())
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1))

  act(() => result.current.setFilter('category', 'delivery'))
  await waitFor(() =>
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'delivery' })),
  )

  act(() => result.current.setLocation('NG', 'Lagos'))
  await waitFor(() =>
    expect(mockList).toHaveBeenLastCalledWith(
      expect.objectContaining({ country: 'NG', city: 'Lagos' }),
    ),
  )
})

test('search is sent as the server-side `q`, debounced', async () => {
  jest.useFakeTimers()
  try {
    const { result } = renderHook(() => useHomeFeed())
    await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS) })
    const callsBefore = mockList.mock.calls.length

    // Typing must not fire a request per keystroke.
    act(() => result.current.setFilter('query', 'p'))
    act(() => result.current.setFilter('query', 'pa'))
    act(() => result.current.setFilter('query', 'paint'))
    expect(mockList.mock.calls.length).toBe(callsBefore)

    await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS) })
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'paint' }))
  } finally {
    jest.useRealTimers()
  }
})

test('a whitespace-only search sends no q at all', async () => {
  jest.useFakeTimers()
  try {
    const { result } = renderHook(() => useHomeFeed())
    act(() => result.current.setFilter('query', '   '))
    await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS) })
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ q: undefined }))
  } finally {
    jest.useRealTimers()
  }
})

test('hasFilters tracks every filter, including the chain', async () => {
  const { result } = renderHook(() => useHomeFeed())
  await waitFor(() => expect(mockList).toHaveBeenCalled())
  expect(result.current.hasFilters).toBe(false)

  act(() => result.current.setFilter('chainId', 'solana:devnet'))
  expect(result.current.hasFilters).toBe(true)

  act(() => result.current.clearAll())
  expect(result.current.hasFilters).toBe(false)
})

test('clearAll resets every filter back to an unfiltered request', async () => {
  const { result } = renderHook(() => useHomeFeed())
  await waitFor(() => expect(mockList).toHaveBeenCalled())

  act(() => result.current.setFilter('category', 'delivery'))
  act(() => result.current.setFilter('chainId', 'solana:devnet'))
  act(() => result.current.setFilter('remote', true))
  await waitFor(() =>
    expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ remote: true })),
  )

  act(() => result.current.clearAll())
  await waitFor(() =>
    expect(mockList).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: undefined, chain_id: undefined, remote: undefined }),
    ),
  )
})

test('exposes the server total, so counts survive pagination', async () => {
  mockList.mockResolvedValue({ data: [{ escrow_id: 'g1' }], total: 87, limit: 20, offset: 0 })
  const { result } = renderHook(() => useHomeFeed())
  await waitFor(() => expect(result.current.list.total).toBe(87))
  expect(result.current.list.items).toHaveLength(1)
})

test('paginates: loadMore appends the next page without duplicating rows', async () => {
  mockList
    .mockResolvedValueOnce({ data: [{ escrow_id: 'g1' }, { escrow_id: 'g2' }], total: 3, limit: 20, offset: 0 })
    // The window shifted — g2 comes back a second time and must be dropped.
    .mockResolvedValueOnce({ data: [{ escrow_id: 'g2' }, { escrow_id: 'g3' }], total: 3, limit: 20, offset: 2 })
  const { result } = renderHook(() => useHomeFeed())
  await waitFor(() => expect(result.current.list.items).toHaveLength(2))

  act(() => result.current.list.loadMore())
  await waitFor(() => expect(result.current.list.items).toHaveLength(3))
  expect(result.current.list.items.map((g) => g.escrow_id)).toEqual(['g1', 'g2', 'g3'])
})
