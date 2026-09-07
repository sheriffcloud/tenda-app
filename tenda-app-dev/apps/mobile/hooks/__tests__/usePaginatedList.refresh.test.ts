/**
 * usePaginatedList — what a RE-fetch does to a list that is already on screen.
 *
 * The distinctions here are the ones a reader notices: a refresh must not
 * blank rows they are looking at, a reload must prune rows the server no
 * longer returns, and a FAILURE must preserve or discard by mode rather than
 * doing whichever the last edit happened to leave. A query change is a
 * different list entirely, which is why it belongs beside them.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { PaginatedResponse } from '@tenda/shared'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { deferred, keyOf, page, rows, type Row } from '../__fixtures__/list-fixtures'

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
