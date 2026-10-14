import { expect, test, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PaginatedResponse } from '@tenda/shared'
import { usePaginatedList } from '@/hooks/pagination/usePaginatedList'
import { cursorPage as page, rows, type Row } from '../__fixtures__/list-fixtures'

test('uses an opaque server cursor instead of an unstable live-feed offset', async () => {
  const fetchPage = vi
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
  const fetchPage = vi
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
  const fetchPage = vi
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
  const fetchPage = vi
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
  const fetchPage = vi.fn().mockResolvedValue(page(rows('a'), null))
  let query: Record<string, string | boolean> = { category: 'delivery', remote: true }
  const { rerender } = renderHook(() => usePaginatedList({ fetchPage, query, keyOf: (row: Row) => row.id }))
  await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1))

  query = { remote: true, category: 'delivery' }
  rerender({})
  expect(fetchPage).toHaveBeenCalledTimes(1)
})

test('authoritative reconciliation reports success and failure without hiding stale rows', async () => {
  const fetchPage = vi.fn()
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
  const fetchPage = vi.fn()
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

test('falls back to offsets when the server sends no cursor at all', async () => {
  // The documented third state: `next_cursor` absent (not null) means this
  // server does not do cursors, so the traversal must fall back to offset vs
  // total. Nothing covered it, and a mutation that skipped the fallback —
  // making hasMore permanently true, an endless Load more — survived the
  // whole suite.
  const noCursor = (data: Row[], total: number): PaginatedResponse<Row> => ({
    data,
    total,
    limit: 2,
    offset: 0,
  })
  const fetchPage = vi
    .fn()
    .mockResolvedValueOnce(noCursor(rows('a', 'b'), 3))
    .mockResolvedValueOnce(noCursor(rows('c'), 3))
  const { result } = renderHook(() =>
    usePaginatedList({
      fetchPage,
      query: {},
      keyOf: (row: Row) => row.id,
      pageSize: 2,
      cursorPagination: true,
    }),
  )

  await waitFor(() => expect(result.current.items).toEqual(rows('a', 'b')))
  // Two of three loaded: offsets say there is more, and no cursor contradicts it.
  expect(result.current.hasMore).toBe(true)

  await act(async () => result.current.loadMore())
  await waitFor(() => expect(result.current.items).toEqual(rows('a', 'b', 'c')))
  // All three loaded — offsets say stop, and nothing keeps the button alive.
  expect(result.current.hasMore).toBe(false)
})

test('a failed initial load does not leave the PREVIOUS query cursor claiming another page', async () => {
  // `clear()` is documented as "back to the start", and in offset mode it is:
  // the offset returns to 0 and `hasMore` is 0 < 0. In CURSOR mode the offset
  // is ignored entirely (shared `hasMorePages`: with a cursor present the
  // answer is `nextCursor !== null`), so resetting only the offset left the
  // PREVIOUS query's cursor standing over an empty, errored list — which then
  // reported another page to load, and would have fetched it under the old
  // cursor. Found in the #54 re-audit; the same test guards mobile's twin.
  const fetchPage = vi
    .fn()
    .mockResolvedValueOnce(page(rows('a', 'b'), 'cursor-2'))
    .mockRejectedValueOnce(new Error('offline'))
  let query: Record<string, string> = { category: 'first' }
  const { result, rerender } = renderHook(() =>
    usePaginatedList({
      fetchPage,
      query,
      keyOf: (row: Row) => row.id,
      pageSize: 2,
      cursorPagination: true,
    }),
  )
  await waitFor(() => expect(result.current.items).toHaveLength(2))
  expect(result.current.hasMore).toBe(true)

  query = { category: 'second' }
  rerender({})
  await waitFor(() => expect(result.current.error).not.toBeNull())

  expect(result.current.items).toEqual([])
  expect(result.current.hasMore).toBe(false)
})

test('a cache HIT does not inherit the previously-viewed query cursor', async () => {
  // Same family as the clear() bug above, on the other path that restores a
  // position. `CachedPage` holds {items, total} and no cursor, so the cache-hit
  // branch resets the OFFSET to the remembered page and leaves nextCursorRef
  // holding whatever the query the reader just came from left there. The
  // revalidation behind the hit normally overwrites it — unless it FAILS, and
  // 'reload' deliberately keeps state on failure. Then loadMore walks the
  // previous filter's cursor and merges its rows into this filter's list.
  const fetchPage = vi
    .fn()
    .mockResolvedValueOnce(page(rows('a', 'b'), 'cursor-A'))
    .mockResolvedValueOnce(page(rows('c', 'd'), 'cursor-B'))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(page(rows('e', 'f'), null))
  let query: Record<string, string> = { category: 'first' }
  const { result, rerender } = renderHook(() =>
    usePaginatedList({
      fetchPage,
      query,
      keyOf: (row: Row) => row.id,
      pageSize: 2,
      cacheQueries: true,
      cursorPagination: true,
    }),
  )
  await waitFor(() => expect(result.current.items).toEqual(rows('a', 'b')))

  query = { category: 'second' }
  rerender({})
  await waitFor(() => expect(result.current.items).toEqual(rows('c', 'd')))

  query = { category: 'first' }
  rerender({})
  await waitFor(() => expect(result.current.items).toEqual(rows('a', 'b')))
  await waitFor(() => expect(result.current.error).not.toBeNull())

  act(() => result.current.loadMore())
  await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(4))
  expect(fetchPage).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ cursor: 'cursor-B' }),
  )
})
