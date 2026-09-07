/**
 * usePaginatedList — refresh vs reload, and what each mode does to the rows on
 * FAILURE. This is where the stale-response-overwrite failure mode is pinned:
 * a failed refresh must keep the reader's data, an initial load must not keep
 * rows belonging to a query that is no longer active.
 */
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { PaginatedResponse } from '@tenda/shared'
import { usePaginatedList } from '@/hooks/pagination/usePaginatedList'
import { keyOf, page, rows, type Row } from '../__fixtures__/list-fixtures'
import { deferred } from '../../../test/deferred'

describe('refresh vs reload', () => {
  it('refresh re-reads page 0 and discards later pages', async () => {
    const fetchPage = vi
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
    const fetchPage = vi
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
    const fetchPage = vi
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
    const fetchPage = vi
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
    const fetchPage = vi.fn().mockReturnValue(pending.promise)
    const { result } = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf }))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.hasFetched).toBe(false)
  })

  it('is NOT loading on the first render when gated off', () => {
    const fetchPage = vi.fn()
    const { result } = renderHook(() =>
      usePaginatedList({ fetchPage, query: {}, keyOf, enabled: false }),
    )
    expect(result.current.isLoading).toBe(false)
  })
})

describe('reload row pruning', () => {
  it('REPLACES page 0 when no later pages are loaded, so removed rows disappear', async () => {
    const fetchPage = vi
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
    const fetchPage = vi
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
    const fetchPage = vi
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
    const fetchPage = vi
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
    const fetchPage = vi
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

