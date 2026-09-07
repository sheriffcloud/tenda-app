/**
 * usePaginatedList — the caller-owned query cache.
 *
 * Page zero outlives the hook so a remounted list column paints rows instead
 * of blinking through a skeleton and then an empty state. What is pinned here
 * is that the cache is keyed by QUERY (one bucket never serves another) and
 * that a cached paint still revalidates behind itself.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { PaginatedResponse } from '@tenda/shared'
import { usePaginatedList } from '@/hooks/usePaginatedList'
import { deferred, keyOf, page, rows, type Row } from '../__fixtures__/list-fixtures'

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
