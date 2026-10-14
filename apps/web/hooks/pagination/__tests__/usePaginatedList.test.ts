/**
 * usePaginatedList — loading and paging. These pin two of the four failure
 * modes the hook exists to prevent (see its header): cursor drift and
 * duplicate keys. Refresh semantics live in .refresh.test.ts, caching in
 * .cache.test.ts, server cursors in .cursor.test.ts.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { PaginatedResponse } from '@tenda/shared'
import { usePaginatedList } from '@/hooks/pagination/usePaginatedList'
import { keyOf, page, rows, type Row } from '../__fixtures__/list-fixtures'
import { deferred } from '../../../test/deferred'

describe('first load', () => {
  it('loads page 0 and exposes the SERVER total, not the loaded count', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(rows('a', 'b'), 57))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.items.map(keyOf)).toEqual(['a', 'b'])
    // The count chips/badges read this — items.length would say 2.
    expect(result.current.total).toBe(57)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.hasFetched).toBe(true)
    expect(fetchPage).toHaveBeenCalledWith({ limit: 2, offset: 0 })
  })

  it('merges the caller query into the page request', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(rows('a'), 1))
    renderHook(() =>
      usePaginatedList({ fetchPage, query: { chain_id: 'solana:devnet' }, keyOf, pageSize: 20 }),
    )
    await waitFor(() =>
      expect(fetchPage).toHaveBeenCalledWith({ chain_id: 'solana:devnet', limit: 20, offset: 0 }),
    )
  })

  it('does not fetch while disabled, and is not stuck loading', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(rows('a'), 1))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, enabled: false }),
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchPage).not.toHaveBeenCalled()
    // A screen gated on a missing user id must not hang on a skeleton.
    expect(result.current.hasFetched).toBe(false)
  })

  it('fetches once the gate opens', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(rows('a'), 1))
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        usePaginatedList({ fetchPage, query: {}, keyOf, enabled }),
      { initialProps: { enabled: false } },
    )
    rerender({ enabled: true })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
  })

  it('surfaces a first-page error and reports an empty list', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf }))
    await waitFor(() => expect(result.current.hasFetched).toBe(true))
    expect(result.current.error).toBe('network down')
    expect(result.current.items).toEqual([])
    expect(result.current.total).toBe(0)
  })

  it('reports a readable message for a non-Error rejection', async () => {
    const fetchPage = vi.fn().mockRejectedValue('boom')
    const { result } = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf }))
    await waitFor(() => expect(result.current.error).toBe('Something went wrong'))
  })
})

describe('loadMore', () => {
  it('appends the next page and advances the cursor by the RETURNED count', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 4))
      .mockResolvedValueOnce(page(rows('c', 'd'), 4, 2))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(4))
    expect(result.current.items.map(keyOf)).toEqual(['a', 'b', 'c', 'd'])
    expect(fetchPage).toHaveBeenLastCalledWith({ limit: 2, offset: 2 })
    expect(result.current.hasMore).toBe(false)
  })

  it('de-duplicates a shifted window WITHOUT skipping the rows behind it', async () => {
    // A row is inserted at the top between the two requests, so page 2's
    // window slides back over 'b'. Naive appending duplicates the key;
    // deriving the next offset from items.length would then skip a row.
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 4))
      .mockResolvedValueOnce(page(rows('b', 'c'), 5, 2))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(3))
    expect(result.current.items.map(keyOf)).toEqual(['a', 'b', 'c'])
    // No duplicate React keys.
    expect(new Set(result.current.items.map(keyOf)).size).toBe(3)

    // Cursor advanced by the returned count (2), not the de-duped count (1).
    act(() => result.current.loadMore())
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(3))
    expect(fetchPage).toHaveBeenLastCalledWith({ limit: 2, offset: 4 })
  })

  it('is a no-op once the cursor reaches the total', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(rows('a', 'b'), 2))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.hasMore).toBe(false))
    act(() => result.current.loadMore())
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('collapses concurrent calls — FlatList fires onEndReached repeatedly', async () => {
    const first = deferred<PaginatedResponse<Row>>()
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 10))
      .mockReturnValueOnce(first.promise)
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    act(() => {
      result.current.loadMore()
      result.current.loadMore()
      result.current.loadMore()
    })
    expect(fetchPage).toHaveBeenCalledTimes(2) // page 0 + exactly one page 1

    await act(async () => { first.resolve(page(rows('c', 'd'), 10, 2)) })
    await waitFor(() => expect(result.current.items).toHaveLength(4))
  })

  it('keeps already-loaded rows when a later page fails', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 10))
      .mockRejectedValueOnce(new Error('page 2 died'))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false))
    expect(result.current.items.map(keyOf)).toEqual(['a', 'b'])
    // A failed append is not a page-level error — the list is still valid.
    expect(result.current.error).toBeNull()

    // And the next end-reach retries from the same cursor.
    fetchPage.mockResolvedValueOnce(page(rows('c'), 10, 2))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(3))
    expect(fetchPage).toHaveBeenLastCalledWith({ limit: 2, offset: 2 })
  })
})

describe('query changes', () => {
  it('resets to page 0 and replaces the list', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 2))
      .mockResolvedValueOnce(page(rows('z'), 1))
    const { result, rerender } = renderHook(
      ({ chain }: { chain?: string }) =>
        usePaginatedList({ fetchPage, query: { chain_id: chain }, keyOf, pageSize: 2 }),
      { initialProps: {} as { chain?: string } },
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    rerender({ chain: 'eip155:84532' })
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['z']))
    expect(result.current.total).toBe(1)
    expect(fetchPage).toHaveBeenLastCalledWith({ chain_id: 'eip155:84532', limit: 2, offset: 0 })
  })

  it('does NOT refetch when the query object is recreated with the same values', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(rows('a'), 1))
    const { result, rerender } = renderHook(() =>
      // A fresh object literal every render — callers must not need useMemo.
      usePaginatedList({ fetchPage, query: { category: 'service' }, keyOf }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    rerender({})
    rerender({})
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('discards a stale in-flight page when the filter changes mid-flight', async () => {
    // The bug this prevents: the slow unfiltered response lands LAST and
    // repopulates the list with rows the active filter excludes.
    const slow = deferred<PaginatedResponse<Row>>()
    const fetchPage = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(page(rows('filtered'), 1))

    const { result, rerender } = renderHook(
      ({ chain }: { chain?: string }) =>
        usePaginatedList({ fetchPage, query: { chain_id: chain }, keyOf }),
      { initialProps: {} as { chain?: string } },
    )

    rerender({ chain: 'eip155:84532' })
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['filtered']))

    // The stale response arrives afterwards and must be ignored entirely.
    await act(async () => { slow.resolve(page(rows('stale-1', 'stale-2'), 99)) })
    expect(result.current.items.map(keyOf)).toEqual(['filtered'])
    expect(result.current.total).toBe(1)
  })

  it('discards a stale in-flight page that FAILS, not just one that resolves', async () => {
    // Twin of the test above, for the other outcome. A superseded request can
    // reject as easily as it can resolve, and without the generation guards in
    // loadFirstPage's catch AND finally an abandoned query's failure would put
    // its error on the query that replaced it — and clear that query's
    // spinner. Both guards were live but unexercised until this test (#46).
    const doomed = deferred<PaginatedResponse<Row>>()
    const replacement = deferred<PaginatedResponse<Row>>()
    const fetchPage = vi
      .fn()
      .mockReturnValueOnce(doomed.promise)
      .mockReturnValueOnce(replacement.promise)

    const { result, rerender } = renderHook(
      ({ chain }: { chain?: string }) =>
        usePaginatedList({ fetchPage, query: { chain_id: chain }, keyOf }),
      { initialProps: {} as { chain?: string } },
    )

    rerender({ chain: 'eip155:84532' })
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2))

    // The abandoned query fails while its REPLACEMENT is still in flight —
    // the state the two guards exist for. Without the catch guard the dead
    // query's error lands on the live one; without the finally guard its
    // cleanup clears the live query's skeleton mid-load.
    await act(async () => { doomed.reject(new Error('abandoned query failed')) })

    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(true)

    await act(async () => { replacement.resolve(page(rows('filtered'), 1)) })
    expect(result.current.items.map(keyOf)).toEqual(['filtered'])
    expect(result.current.total).toBe(1)
    expect(result.current.isLoading).toBe(false)
  })

  it('discards a stale loadMore page when the filter changes mid-append', async () => {
    const slowPage2 = deferred<PaginatedResponse<Row>>()
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 10))
      .mockReturnValueOnce(slowPage2.promise)
      .mockResolvedValueOnce(page(rows('z'), 1))

    const { result, rerender } = renderHook(
      ({ chain }: { chain?: string }) =>
        usePaginatedList({ fetchPage, query: { chain_id: chain }, keyOf, pageSize: 2 }),
      { initialProps: {} as { chain?: string } },
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    act(() => result.current.loadMore())

    rerender({ chain: 'eip155:84532' })
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['z']))

    await act(async () => { slowPage2.resolve(page(rows('c', 'd'), 10, 2)) })
    // Rows from the OLD query must never be appended to the new list.
    expect(result.current.items.map(keyOf)).toEqual(['z'])
    // …and the footer spinner must not be stranded on.
    expect(result.current.isLoadingMore).toBe(false)
  })
})

