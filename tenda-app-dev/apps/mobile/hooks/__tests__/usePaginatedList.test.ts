/**
 * usePaginatedList — first load and paging.
 *
 * These tests pin two of the four failure modes the hook exists to prevent
 * (see its own header): cursor drift and duplicate keys, plus counts read off
 * the loaded array instead of the server total. Refresh semantics live in
 * `.refresh.test.ts`, the caller-owned cache in `.cache.test.ts`, cursor
 * paging in `.cursor.test.ts` and the response/user races in `.races.test.ts`.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { PaginatedResponse } from '@tenda/shared'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { deferred, keyOf, page, rows, type Row } from '../__fixtures__/list-fixtures'

describe('first load', () => {
  it('loads page 0 and exposes the SERVER total, not the loaded count', async () => {
    const fetchPage = jest.fn().mockResolvedValue(page(rows('a', 'b'), 57))
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
    const fetchPage = jest.fn().mockResolvedValue(page(rows('a'), 1))
    renderHook(() =>
      usePaginatedList({ fetchPage, query: { chain_id: 'solana:devnet' }, keyOf, pageSize: 20 }),
    )
    await waitFor(() =>
      expect(fetchPage).toHaveBeenCalledWith({ chain_id: 'solana:devnet', limit: 20, offset: 0 }),
    )
  })

  it('does not fetch while disabled, and is not stuck loading', async () => {
    const fetchPage = jest.fn().mockResolvedValue(page(rows('a'), 1))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, enabled: false }),
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchPage).not.toHaveBeenCalled()
    // A screen gated on a missing user id must not hang on a skeleton.
    expect(result.current.hasFetched).toBe(false)
  })

  it('fetches once the gate opens', async () => {
    const fetchPage = jest.fn().mockResolvedValue(page(rows('a'), 1))
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        usePaginatedList({ fetchPage, query: {}, keyOf, enabled }),
      { initialProps: { enabled: false } },
    )
    rerender({ enabled: true })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
  })

  it('surfaces a first-page error and reports an empty list', async () => {
    const fetchPage = jest.fn().mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf }))
    await waitFor(() => expect(result.current.hasFetched).toBe(true))
    expect(result.current.error).toBe('network down')
    expect(result.current.items).toEqual([])
    expect(result.current.total).toBe(0)
  })

  it('reports a readable message for a non-Error rejection', async () => {
    const fetchPage = jest.fn().mockRejectedValue('boom')
    const { result } = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf }))
    await waitFor(() => expect(result.current.error).toBe('Something went wrong'))
  })
})

describe('first-frame state', () => {
  it('reports isLoading on the FIRST render, before the effect fires', () => {
    // The fetch is kicked off by an effect (post-render). Starting at false
    // renders one frame of "settled, no rows" — a flash of the empty state.
    // Keep the request pending: this assertion is specifically about the
    // pre-response frame. A resolved promise would update state after the
    // assertion (and potentially after test cleanup), producing an act warning
    // while testing a different moment from the one this case names.
    const pending = deferred<PaginatedResponse<Row>>()
    const fetchPage = jest.fn().mockReturnValue(pending.promise)
    const { result } = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf }))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.hasFetched).toBe(false)
  })

  it('is NOT loading on the first render when gated off', () => {
    const fetchPage = jest.fn()
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, enabled: false }),
    )
    expect(result.current.isLoading).toBe(false)
  })
})

describe('loadMore', () => {
  it('appends the next page and advances the cursor by the RETURNED count', async () => {
    const fetchPage = jest
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
    const fetchPage = jest
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
    const fetchPage = jest.fn().mockResolvedValue(page(rows('a', 'b'), 2))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.hasMore).toBe(false))
    act(() => result.current.loadMore())
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('collapses concurrent calls — FlatList fires onEndReached repeatedly', async () => {
    const first = deferred<PaginatedResponse<Row>>()
    const fetchPage = jest
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
    const fetchPage = jest
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

describe('loadMore callback identity', () => {
  it('stays stable as the total changes', async () => {
    // loadMore gates on totalRef, not `total` state, so its identity no longer
    // churns on every page. FlatList re-subscribes onEndReached whenever that
    // prop changes, and the ref read also closes the render-lag window where
    // a call landing before the re-render would decide on the previous total.
    // (That window is not reachable through RTL, which flushes renders — the
    // identity below is the part a test can actually assert.)
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('a'), 9))
      .mockResolvedValueOnce(page(rows('b'), 42, 1))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 1 }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    const before = result.current.loadMore

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.total).toBe(42))
    expect(result.current.loadMore).toBe(before)
  })
})
