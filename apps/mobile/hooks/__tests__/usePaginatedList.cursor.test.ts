import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { PaginatedResponse } from '@tenda/shared'
import { usePaginatedList } from '@/hooks/usePaginatedList'

interface Row { id: string }
const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }))

function page(data: Row[], next_cursor: string | null): PaginatedResponse<Row> {
  return { data, total: 4, limit: 2, offset: 0, next_cursor }
}

test('uses an opaque server cursor instead of an unstable live-feed offset', async () => {
  const fetchPage = jest
    .fn()
    .mockResolvedValueOnce(page(rows('a', 'b'), 'cursor-2'))
    .mockResolvedValueOnce(page(rows('c', 'd'), null))
  const { result } = renderHook(() =>
    usePaginatedList({
      fetchPage,
      query: {},
      keyOf: (row: Row) => row.id,
      pageSize: 2,
      cursorPagination: true,
    }),
  )
  await waitFor(() => expect(result.current.items).toHaveLength(2))
  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.items).toHaveLength(4))
  expect(fetchPage).toHaveBeenLastCalledWith({ limit: 2, offset: 0, cursor: 'cursor-2' })
  expect(result.current.hasMore).toBe(false)
})

test('falls back to offset pagination when a server-only ordering omits cursors', async () => {
  const fetchPage = jest
    .fn()
    .mockResolvedValueOnce({ ...page(rows('a', 'b'), null), next_cursor: undefined })
    .mockResolvedValueOnce({ ...page(rows('c', 'd'), null), next_cursor: undefined, offset: 2 })
  const { result } = renderHook(() => usePaginatedList({
    fetchPage,
    query: { q: 'search' },
    keyOf: (row: Row) => row.id,
    pageSize: 2,
    cursorPagination: true,
  }))
  await waitFor(() => expect(result.current.items).toHaveLength(2))
  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.items).toHaveLength(4))
  expect(fetchPage).toHaveBeenLastCalledWith({ q: 'search', limit: 2, offset: 2 })
})

test('background reload preserves the cursor for already-loaded pages', async () => {
  const fetchPage = jest
    .fn()
    .mockResolvedValueOnce(page(rows('a', 'b'), 'cursor-2'))
    .mockResolvedValueOnce(page(rows('c', 'd'), 'cursor-3'))
    .mockResolvedValueOnce(page(rows('new', 'a'), 'rewound-cursor-2'))
    .mockResolvedValueOnce({ ...page(rows('e'), null), total: 6 })
  const { result } = renderHook(() => usePaginatedList({
    fetchPage,
    query: {},
    keyOf: (row: Row) => row.id,
    pageSize: 2,
    cursorPagination: true,
  }))

  await waitFor(() => expect(result.current.items).toEqual(rows('a', 'b')))
  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.items).toEqual(rows('a', 'b', 'c', 'd')))
  await act(async () => { await result.current.reload() })
  act(() => result.current.loadMore())
  await waitFor(() => expect(result.current.items).toContainEqual({ id: 'e' }))

  expect(fetchPage).toHaveBeenLastCalledWith({ limit: 2, offset: 0, cursor: 'cursor-3' })
  expect(fetchPage).not.toHaveBeenCalledWith({ limit: 2, offset: 0, cursor: 'rewound-cursor-2' })
})

test('writes realtime changes through to the active query cache', async () => {
  const neverSettles = new Promise<PaginatedResponse<Row>>(() => undefined)
  const fetchPage = jest
    .fn()
    .mockResolvedValueOnce(page(rows('a', 'removed'), null))
    .mockResolvedValueOnce(page(rows('other'), null))
    .mockReturnValue(neverSettles)
  let query = { category: 'first' }
  const { result, rerender } = renderHook(() => usePaginatedList({
    fetchPage,
    query,
    keyOf: (row: Row) => row.id,
    pageSize: 2,
    cacheQueries: true,
  }))

  await waitFor(() => expect(result.current.items).toEqual(rows('a', 'removed')))
  act(() => result.current.applyRealtimeItems(rows('a')))
  query = { category: 'second' }
  rerender({})
  await waitFor(() => expect(result.current.items).toEqual(rows('other')))

  query = { category: 'first' }
  rerender({})
  await waitFor(() => expect(result.current.items).toEqual(rows('a')))
  expect(result.current.total).toBe(3)
})

test('property insertion order does not create a different query', async () => {
  const fetchPage = jest.fn().mockResolvedValue(page(rows('a'), null))
  let query: Record<string, string | boolean> = { category: 'delivery', remote: true }
  const { rerender } = renderHook(() => usePaginatedList({ fetchPage, query, keyOf: (row: Row) => row.id }))
  await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1))

  query = { remote: true, category: 'delivery' }
  rerender({})
  expect(fetchPage).toHaveBeenCalledTimes(1)
})

test('authoritative reconciliation reports success and failure without hiding stale rows', async () => {
  const fetchPage = jest.fn()
    .mockResolvedValueOnce(page(rows('stale'), null))
    .mockResolvedValueOnce(page(rows('fresh'), null))
    .mockRejectedValueOnce(new Error('offline'))
  const { result } = renderHook(() => usePaginatedList({
    fetchPage,
    query: {},
    keyOf: (row: Row) => row.id,
  }))
  await waitFor(() => expect(result.current.items).toEqual(rows('stale')))

  let succeeded = false
  await act(async () => { succeeded = await result.current.reconcile() })
  expect(succeeded).toBe(true)
  expect(result.current.items).toEqual(rows('fresh'))

  await act(async () => { succeeded = await result.current.reconcile() })
  expect(succeeded).toBe(false)
  expect(result.current.items).toEqual(rows('fresh'))
})

test('a realtime event cannot be overwritten by an older in-flight HTTP snapshot', async () => {
  let resolveStale: ((page: PaginatedResponse<Row>) => void) | undefined
  const staleRequest = new Promise<PaginatedResponse<Row>>((resolve) => { resolveStale = resolve })
  const fetchPage = jest.fn()
    .mockReturnValueOnce(staleRequest)
    .mockResolvedValueOnce(page(rows('realtime', 'server-current'), null))
  const { result } = renderHook(() => usePaginatedList({
    fetchPage,
    query: {},
    keyOf: (row: Row) => row.id,
  }))

  act(() => result.current.applyRealtimeItems(rows('realtime')))
  expect(fetchPage).toHaveBeenCalledTimes(2)
  await act(async () => resolveStale?.(page(rows('stale'), null)))
  await waitFor(() => expect(result.current.items).toEqual(rows('realtime', 'server-current')))
  expect(result.current.items).not.toContainEqual({ id: 'stale' })
})
