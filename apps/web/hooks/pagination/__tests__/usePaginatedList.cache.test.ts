/**
 * usePaginatedList — page-zero caching, both the per-instance kind and the
 * caller-owned cache that lets a workspace list column survive the router
 * remounting it. Counts must come from the server total, never the loaded
 * array — the fourth failure mode.
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { render, renderHook, act, waitFor } from '@testing-library/react'
import { createQueryCache, createQueryKey, readPage, type PaginatedResponse } from '@tenda/shared'
import { usePaginatedList } from '@/hooks/pagination/usePaginatedList'
import { clearAccountState } from '@/lib/account-state'
import { keyOf, page, rows, type Row } from '../__fixtures__/list-fixtures'
import { deferred } from '../../../test/deferred'

describe('cacheQueries', () => {
  it('is off by default: revisiting a query refetches with a skeleton-raising load', async () => {
    const fetchPage = vi
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
    const fetchPage = vi
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
    const fetchPage = vi
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
    const fetchPage = vi
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
    const fetchPage = vi
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

describe('a cache the caller owns', () => {
  /**
   * Records what EVERY render saw, not just the last one.
   *
   * `renderHook` flushes effects before it returns, so reading `result.current`
   * cannot tell a value seeded during render from one an effect set a moment
   * later — and the whole point of the cache seeding is that the FIRST render
   * already has the rows. Three mutations survived a version of these tests
   * that read `result.current`.
   */
  function renderRecording<TQuery extends object>(
    options: Parameters<typeof usePaginatedList<{ id: string }, TQuery>>[0],
  ) {
    const frames: { rows: number; isLoading: boolean; hasFetched: boolean }[] = []
    function Probe() {
      const list = usePaginatedList(options)
      frames.push({
        rows: list.items.length,
        isLoading: list.isLoading,
        hasFetched: list.hasFetched,
      })
      return null
    }
    const view = render(createElement(Probe))
    return { frames, view }
  }

  /**
   * `renderRecording` deliberately returns the moment the first frames are
   * captured — the assertions are about the FIRST paint. But the mount effect
   * is still in flight, so a test that ends there settles its load outside
   * `act` and React warns. Flushing once here lets the load land inside act
   * without touching a single assertion; the extra frames it produces are
   * exactly the ones the surviving `frames.some(...)` checks want to see.
   */
  async function settle() {
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('paints page zero on the FIRST render of a second mount', async () => {
    // The workspace's list columns are remounted by the router on every row
    // they open — the @list slot moves between its entries and React tears the
    // component down. With a per-instance cache the column rebuilt from
    // scratch each time and blinked: a skeleton, and then the EMPTY state.
    const cache = createQueryCache<{ id: string }>()
    const fetchPage = vi.fn().mockResolvedValue(page(rows('a'), 1))

    const first = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf, cache }))
    await waitFor(() => expect(first.result.current.items.map(keyOf)).toEqual(['a']))
    first.unmount()

    const { frames } = renderRecording({ fetchPage, query: {}, keyOf, cache })
    // The very first frame, before any effect: rows on screen, no spinner.
    expect(frames[0]).toEqual({ rows: 1, isLoading: false, hasFetched: true })
    // …and no frame in the whole mount ever showed a spinner or an empty list.
    expect(frames.some((frame) => frame.isLoading)).toBe(false)
    expect(frames.some((frame) => frame.rows === 0)).toBe(false)
  })

  it('still revalidates behind the rows it painted', async () => {
    const cache = createQueryCache<{ id: string }>()
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(rows('stale'), 1))
      .mockResolvedValueOnce(page(rows('fresh'), 1))

    const first = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf, cache }))
    await waitFor(() => expect(first.result.current.items.map(keyOf)).toEqual(['stale']))
    first.unmount()

    const second = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf, cache }))
    expect(second.result.current.items.map(keyOf)).toEqual(['stale'])
    // The cache serves at most one navigation of staleness, and only until the
    // silent reload lands.
    await waitFor(() => expect(second.result.current.items.map(keyOf)).toEqual(['fresh']))
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it("does not serve one query's page zero to another", async () => {
    const cache = createQueryCache<{ id: string }>()
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page(rows('open-row'), 1))
      .mockResolvedValueOnce(page(rows('resolved-row'), 1))

    const first = renderHook(() =>
      usePaginatedList({ fetchPage, query: { status: 'open' }, keyOf, cache }),
    )
    await waitFor(() => expect(first.result.current.items.map(keyOf)).toEqual(['open-row']))
    first.unmount()

    // A different bucket is a different key: nothing to seed, and a real load.
    const { frames } = renderRecording({ fetchPage, query: { status: 'resolved' }, keyOf, cache })
    expect(frames[0]).toEqual({ rows: 0, isLoading: true, hasFetched: false })
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2))
  })

  it('leaves an unshared list untouched — no cache, no seeding', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(rows('a'), 1))
    const first = renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf }))
    await waitFor(() => expect(first.result.current.items.map(keyOf)).toEqual(['a']))
    first.unmount()

    const { frames } = renderRecording({ fetchPage, query: {}, keyOf })
    expect(frames[0]).toEqual({ rows: 0, isLoading: true, hasFetched: false })
    await settle()
  })
})

describe('a caller-owned cache across an ACCOUNT switch', () => {
  it('does not write an in-flight page into a cache the switch just emptied', async () => {
    // The cache outlives this hook by design — that is what stops the column
    // blinking when the router remounts it. It therefore also outlives the
    // SESSION, and `clearAccountState` empties it on sign-out. What that
    // cannot stop is a page already on its way: the hook's own generation is
    // unchanged (nothing superseded the load), so without an account guard it
    // writes page zero straight back, and the next account's column seeds its
    // first paint from it (#45).
    const cache = createQueryCache<Row>()
    const gate = deferred<PaginatedResponse<Row>>()
    const fetchPage = vi.fn().mockReturnValue(gate.promise)
    renderHook(() => usePaginatedList({ fetchPage, query: {}, keyOf, cache }))
    await waitFor(() => expect(fetchPage).toHaveBeenCalled())

    clearAccountState()
    gate.resolve(page(rows('previous-account-row'), 1))
    await act(async () => { await Promise.resolve() })

    expect(readPage(cache, createQueryKey({}))).toBeUndefined()
  })
})
