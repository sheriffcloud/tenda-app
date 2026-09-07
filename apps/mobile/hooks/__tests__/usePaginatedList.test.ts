/**
 * usePaginatedList — the offset-pagination controller. These tests pin the
 * four failure modes it exists to prevent (see the hook's own header):
 * cursor drift, duplicate keys, stale-response overwrite, and counts read
 * off the loaded array instead of the server total.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { PaginatedResponse } from '@tenda/shared'
import { usePaginatedList } from '@/hooks/usePaginatedList'

interface Row { id: string }
const keyOf = (r: Row) => r.id
const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }))

function page(data: Row[], total: number, offset = 0): PaginatedResponse<Row> {
  return { data, total, limit: 20, offset }
}

/** A promise whose resolution the test controls, for racing scenarios. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

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

describe('query changes', () => {
  it('resets to page 0 and replaces the list', async () => {
    const fetchPage = jest
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
    const fetchPage = jest.fn().mockResolvedValue(page(rows('a'), 1))
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
    const fetchPage = jest
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

  it('discards a stale loadMore page when the filter changes mid-append', async () => {
    const slowPage2 = deferred<PaginatedResponse<Row>>()
    const fetchPage = jest
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

describe('refresh vs reload', () => {
  it('refresh re-reads page 0 and discards later pages', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 4))
      .mockResolvedValueOnce(page(rows('c', 'd'), 4, 2))
      .mockResolvedValueOnce(page(rows('a', 'b'), 4))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(4))

    await act(async () => { await result.current.refresh() })
    expect(result.current.items.map(keyOf)).toEqual(['a', 'b'])
    // Cursor rewound too, so the next end-reach re-walks page 1.
    act(() => result.current.loadMore())
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(4))
    expect(fetchPage).toHaveBeenLastCalledWith({ limit: 2, offset: 2 })
  })

  it('reload PRESERVES loaded pages — a background poll must not collapse the feed', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 4))
      .mockResolvedValueOnce(page(rows('c', 'd'), 4, 2))
      // A newly-posted gig arrives at the top of page 0.
      .mockResolvedValueOnce(page(rows('new', 'a'), 5))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(4))

    let reported = 0
    await act(async () => { reported = await result.current.reload() })
    // The user keeps everything they had scrolled to, with the new row on top.
    expect(result.current.items.map(keyOf)).toEqual(['new', 'a', 'b', 'c', 'd'])
    expect(result.current.total).toBe(5)
    // The fresh total comes back through the promise — a poller reading it off
    // `total` would see the pre-reload value until the next render.
    expect(reported).toBe(5)
  })

  it('reload keeps the existing rows when the poll fails', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 2))
      .mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    let reported = -1
    await act(async () => { reported = await result.current.reload() })
    expect(result.current.items.map(keyOf)).toEqual(['a', 'b'])
    // A failed poll reports the last known total, so the poller's change
    // detection doesn't read a spurious 0 and reset its back-off.
    expect(reported).toBe(2)
  })

  it('refresh clears a previous error once the retry succeeds', async () => {
    const fetchPage = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page(rows('a'), 1))
    const { result } = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf }))
    await waitFor(() => expect(result.current.error).toBe('offline'))

    await act(async () => { await result.current.refresh() })
    expect(result.current.error).toBeNull()
    expect(result.current.items).toHaveLength(1)
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

describe('reload row pruning', () => {
  it('REPLACES page 0 when no later pages are loaded, so removed rows disappear', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 2))
      // 'b' was taken/expired server-side and is gone from the feed.
      .mockResolvedValueOnce(page(rows('a'), 1))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    await act(async () => { await result.current.reload() })
    // A merge here would strand 'b' on screen until an explicit refresh.
    expect(result.current.items.map(keyOf)).toEqual(['a'])
    expect(result.current.total).toBe(1)
  })

  it('still MERGES once the user has paged past page 0', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 4))
      .mockResolvedValueOnce(page(rows('c', 'd'), 4, 2))
      .mockResolvedValueOnce(page(rows('a', 'b'), 4))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(4))

    await act(async () => { await result.current.reload() })
    // Page 1 survives — replacing would yank it out from under a scrolled user.
    expect(result.current.items.map(keyOf)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('failure preserves vs discards by mode', () => {
  it('a failed REFRESH keeps the loaded rows and the cursor', async () => {
    // total 6 so rows genuinely remain after two pages — otherwise the
    // cursor assertion below would pass for the wrong reason (hasMore false).
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 6))
      .mockResolvedValueOnce(page(rows('c', 'd'), 6, 2))
      .mockRejectedValueOnce(new Error('wifi dropped'))
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, pageSize: 2 }),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(4))

    await act(async () => { await result.current.refresh() })
    // Blanking four loaded rows over a transient blip is the worse failure.
    expect(result.current.items.map(keyOf)).toEqual(['a', 'b', 'c', 'd'])
    expect(result.current.total).toBe(6)
    expect(result.current.error).toBe('wifi dropped')

    // The cursor survived too, so paging resumes where it left off rather
    // than re-walking page 0.
    fetchPage.mockResolvedValueOnce(page(rows('e'), 6, 4))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(5))
    expect(fetchPage).toHaveBeenLastCalledWith({ limit: 2, offset: 4 })
  })

  it('a failed FILTER CHANGE clears the previous query rows', async () => {
    // Opposite rule: those rows contradict the now-active filter, so leaving
    // them on screen would show results the user did not ask for.
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 2))
      .mockRejectedValueOnce(new Error('filter fetch failed'))
    const { result, rerender } = renderHook(
      ({ chain }: { chain?: string }) =>
        usePaginatedList({ fetchPage, query: { chain_id: chain }, keyOf, pageSize: 2 }),
      { initialProps: {} as { chain?: string } },
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    rerender({ chain: 'eip155:84532' })
    await waitFor(() => expect(result.current.error).toBe('filter fetch failed'))
    expect(result.current.items).toEqual([])
    expect(result.current.total).toBe(0)
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

describe('cacheQueries', () => {
  it('is off by default: revisiting a query refetches with a skeleton-raising load', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('a'), 1))
      .mockResolvedValueOnce(page(rows('z'), 1))
      .mockResolvedValueOnce(page(rows('a'), 1))
    const { result, rerender } = renderHook(
      ({ chain }: { chain?: string }) =>
        usePaginatedList({ fetchPage, query: { chain_id: chain }, keyOf }),
      { initialProps: {} as { chain?: string } },
    )
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['a']))

    rerender({ chain: 'celo' })
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['z']))

    // Back to the first query: with no cache the list empties to a loading
    // state before the response lands.
    rerender({})
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['a']))
    expect(fetchPage).toHaveBeenCalledTimes(3)
  })

  it('paints a revisited query from memory with NO loading state', async () => {
    // The point of the option: tapping back to a chain chip you already viewed
    // must not blank the body for a round-trip.
    const revisit = deferred<PaginatedResponse<Row>>()
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('a', 'b'), 2))
      .mockResolvedValueOnce(page(rows('z'), 1))
      .mockReturnValueOnce(revisit.promise)

    const { result, rerender } = renderHook(
      ({ chain }: { chain?: string }) =>
        usePaginatedList({
          fetchPage,
          query: { chain_id: chain },
          keyOf,
          pageSize: 2,
          cacheQueries: true,
        }),
      { initialProps: {} as { chain?: string } },
    )
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    rerender({ chain: 'celo' })
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['z']))

    rerender({})
    // Synchronously, in the same commit as the query change: remembered rows,
    // remembered server total, and no spinner of any kind.
    expect(result.current.items.map(keyOf)).toEqual(['a', 'b'])
    expect(result.current.total).toBe(2)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)

    // …and it still revalidates behind the paint, so a taken gig disappears.
    await act(async () => { revisit.resolve(page(rows('a'), 1)) })
    expect(result.current.items.map(keyOf)).toEqual(['a'])
    expect(result.current.total).toBe(1)
  })

  it('does not use the cache for a query never loaded before', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('a'), 1))
      .mockResolvedValueOnce(page(rows('z'), 1))
    const { result, rerender } = renderHook(
      ({ chain }: { chain?: string }) =>
        usePaginatedList({ fetchPage, query: { chain_id: chain }, keyOf, cacheQueries: true }),
      { initialProps: {} as { chain?: string } },
    )
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['a']))

    rerender({ chain: 'celo' })
    // A cache MISS must still raise the loading state — that flag is what puts
    // the skeleton in the body. The controller keeps the previous rows in
    // `items` (so a FAILED filter change can still decide what to do with
    // them); blanking what's on screen is PaginatedList's job, off isLoading.
    expect(result.current.isLoading).toBe(true)
    expect(result.current.items.map(keyOf)).toEqual(['a'])
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['z']))
  })

  it('caches page 0 under the query it was REQUESTED for, not the active one', async () => {
    // Rapid A→B switching: A's slow response must not be remembered as B's.
    const slowA = deferred<PaginatedResponse<Row>>()
    const fetchPage = jest
      .fn()
      .mockReturnValueOnce(slowA.promise)
      .mockResolvedValueOnce(page(rows('b-row'), 1))
      .mockResolvedValueOnce(page(rows('a-row'), 1))

    const { result, rerender } = renderHook(
      ({ chain }: { chain?: string }) =>
        usePaginatedList({ fetchPage, query: { chain_id: chain }, keyOf, cacheQueries: true }),
      { initialProps: { chain: 'a' } as { chain?: string } },
    )
    rerender({ chain: 'b' })
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['b-row']))
    await act(async () => { slowA.resolve(page(rows('a-stale'), 9)) })

    // Back to A: the superseded response was dropped, so nothing is cached for
    // A and it loads fresh rather than painting A's rows under B's key.
    rerender({ chain: 'a' })
    expect(result.current.items.map(keyOf)).toEqual(['b-row'])
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['a-row']))
  })

  it('keeps the cache fresh from a pull-to-refresh', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page(rows('old'), 1))
      .mockResolvedValueOnce(page(rows('fresh'), 1)) // refresh
      .mockResolvedValueOnce(page(rows('z'), 1)) // other chain
      .mockResolvedValueOnce(page(rows('newest'), 1)) // revalidate on return
    const { result, rerender } = renderHook(
      ({ chain }: { chain?: string }) =>
        usePaginatedList({ fetchPage, query: { chain_id: chain }, keyOf, cacheQueries: true }),
      { initialProps: {} as { chain?: string } },
    )
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['old']))
    await act(async () => { await result.current.refresh() })
    expect(result.current.items.map(keyOf)).toEqual(['fresh'])

    rerender({ chain: 'celo' })
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['z']))
    rerender({})
    // The refreshed rows, not the stale first page, are what gets painted.
    expect(result.current.items.map(keyOf)).toEqual(['fresh'])
    // Then the background revalidation must really settle. Waiting for a
    // distinct response both prevents an update leaking beyond this test and
    // proves the cache hit did not suppress its network freshness check.
    await waitFor(() => expect(result.current.items.map(keyOf)).toEqual(['newest']))
  })
})
