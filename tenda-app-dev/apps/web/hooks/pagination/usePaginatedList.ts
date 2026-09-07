import { useCallback, useEffect, useRef, useState } from 'react'
import { PAGE_SIZE, pageLoadErrorMessage, mergeById, createQueryKey } from '@tenda/shared'
import { accountGeneration } from '@/lib/account-state'
import { usePageCache } from './usePageCache'
import { usePageCursor } from './usePageCursor'
import type { FirstPageResult, PaginatedListState, UsePaginatedListOptions } from './paginated-list.types'

export type { PageParams, PaginatedListState, UsePaginatedListOptions } from './paginated-list.types'

export function usePaginatedList<TItem, TQuery extends object>({
  fetchPage,
  query,
  keyOf,
  pageSize = PAGE_SIZE,
  enabled = true,
  cacheQueries = false,
  cache,
  cursorPagination = false,
}: UsePaginatedListOptions<TItem, TQuery>): PaginatedListState<TItem> {
  // Page-zero caching and offset/cursor traversal each own their own hook; see
  // those files for the reasoning this one no longer carries.
  const pageCache = usePageCache<TItem>({ cacheQueries, cache })
  // Computed once and shared by the seed below and the query effect, which
  // always agreed — being the same call on the same input — but were free not to.
  const queryKey = createQueryKey(query)

  /**
   * The cache-hit branch below runs in an EFFECT, after paint — so the whole
   * first render has to be seeded from the cache, not just the spinner. Seeding
   * `isLoading` alone traded a frame of skeleton for a frame of the EMPTY state,
   * which is a worse lie: measured as ["rows:1", "rows:0", "rows:1"].
   */
  const seed = pageCache.read(queryKey)

  const [items, setItems] = useState<TItem[]>(() => seed?.items ?? [])
  const [total, setTotal] = useState(() => seed?.total ?? 0)
  // Seeded from `enabled` so the pre-effect first render does not flash empty.
  const [isLoading, setIsLoading] = useState(() => enabled && seed === undefined)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hasFetched, setHasFetched] = useState(() => seed !== undefined)
  const [error, setError] = useState<string | null>(null)

  const cursor = usePageCursor(cursorPagination)
  const genRef = useRef(0)
  // Collapses concurrent loadMore calls — a double-clicked Load-more button
  // (or a future scroll sentinel firing twice) must not stack requests.
  const inFlightRef = useRef(false)

  // Latest values without re-creating callbacks on every render.
  const fetchPageRef = useRef(fetchPage)
  fetchPageRef.current = fetchPage
  const keyOfRef = useRef(keyOf)
  keyOfRef.current = keyOf
  const queryRef = useRef(query)
  queryRef.current = query
  const pageCacheRef = useRef(pageCache)
  pageCacheRef.current = pageCache
  // Attribute a landed page to the query requested, not the current query.
  const queryKeyRef = useRef(queryKey)
  queryKeyRef.current = queryKey

  // Mirrors state for synchronous reads inside async flows.
  const totalRef = useRef(0)

  /**
   * Load page 0. `mode` controls the spinner and failure preservation:
   *   - 'initial' → skeleton; list replaced. The list IDENTITY changed (mount
   *                 or filter change), so on failure the old rows are cleared —
   *                 they belong to a query that is no longer active.
   *   - 'refresh' → pull-to-refresh; replace on success, preserve on failure.
   *   - 'reload'  → no spinner; merge after page 0 so polling keeps scroll state.
   */
  const loadFirstPage = useCallback(
    async (mode: 'initial' | 'refresh' | 'reload'): Promise<FirstPageResult> => {
      const gen = ++genRef.current
      // Captured up front: by the time this resolves the user may have moved
      // on, and caching page 0 under the NEW key would attribute one query's
      // rows to another.
      const requestedKey = queryKeyRef.current
      inFlightRef.current = true
      if (mode === 'initial') setIsLoading(true)
      if (mode === 'refresh') setIsRefreshing(true)
      // Any in-flight loadMore is now superseded and will skip its own
      // cleanup (its generation is stale) — clear its spinner here so a
      // filter change mid-append can't strand the footer spinner on.
      setIsLoadingMore(false)
      setError(null)
      try {
        // `gen` supersedes within a session; the ACCOUNT can change under it
        // too, and the cache below outlives this hook (#45).
        const account = accountGeneration()
        const page = await fetchPageRef.current({
          ...queryRef.current,
          limit: pageSize,
          offset: 0,
        })
        if (gen !== genRef.current) return { total: totalRef.current, succeeded: false }
        setTotal(page.total)
        totalRef.current = page.total
        // Every mode requests offset 0, so this response IS page 0 for
        // `requestedKey` regardless of which branch below renders it.
        pageCacheRef.current.rememberForAccount(
          requestedKey,
          { items: page.data, total: page.total },
          account,
        )
        if (mode === 'reload' && cursor.offset() > pageSize) {
          // Preserve later pages during heartbeat polling. Deleted later-page
          // rows reconcile on an authoritative refresh or their realtime event.
          setItems((current) => mergeById(page.data, current, keyOfRef.current))
          cursor.keepAtLeast(page.data.length)
        } else {
          // 'initial'/'refresh', and 'reload' while still on page 0 (the
          // common case — most users never scroll past it). Replacing is what
          // makes a gig that was taken or expired actually DISAPPEAR instead
          // of lingering; with no later pages loaded, nothing is lost.
          setItems(page.data)
          cursor.resetTo(page.data.length)
        }
        // Page 0's cursor would replay pages the user already has. Re-reads the
        // offset the branch above just mutated — as the pre-split code did, and
        // deliberately not hoisted: for any page within `pageSize` it lands on
        // the same side, and hoisting would change behaviour if a server ever
        // returned more rows than the limit.
        if (!(mode === 'reload' && cursor.offset() > pageSize)) {
          cursor.setCursor(page.next_cursor)
        }
        return { total: page.total, succeeded: true }
      } catch (e) {
        if (gen !== genRef.current) return { total: totalRef.current, succeeded: false }
        setError(pageLoadErrorMessage(e))
        if (mode === 'initial') {
          // The list identity changed (mount, or a filter change), so whatever
          // is on screen belongs to a query that is no longer active — clear
          // it and let the screen show its error state. This is why 'initial'
          // clears even though the list is usually already empty: a filter
          // change re-enters here with the PREVIOUS filter's rows loaded.
          setItems([])
          setTotal(0)
          totalRef.current = 0
          cursor.clear()
        }
        // 'refresh'/'reload' deliberately keep items, total and the cursor:
        // the rows are still valid, just not newer. `error` is set either way,
        // and PaginatedList only swaps in the error state when the list is
        // empty — so a failed refresh leaves the user's data intact.
        return { total: totalRef.current, succeeded: false }
      } finally {
        if (gen === genRef.current) {
          inFlightRef.current = false
          setIsLoading(false)
          setIsRefreshing(false)
          setHasFetched(true)
        }
      }
    },
    [pageSize, cursor],
  )

  // Bumping the generation invalidates any page still in flight for the OLD
  // query — without it a slow response repopulates the list with rows the
  // active filter excludes.
  useEffect(() => {
    if (!enabled) return

    const cached = pageCache.read(queryKey)
    if (cached === undefined) {
      // The cursor is NOT pre-rewound here. `loadFirstPage` always requests
      // offset 0 and owns the cursor on both outcomes, so rewinding up front is
      // redundant on success and actively wrong on failure — it would leave the
      // preserved rows paired with a cursor pointing back at page 0.
      void loadFirstPage('initial')
      return
    }

    // Cache hit: paint the remembered page 0 synchronously, then revalidate in
    // 'reload' mode, which raises NO spinner — so a filter the user has
    // already visited never shows a skeleton at all.
    setItems(cached.items)
    setTotal(cached.total)
    totalRef.current = cached.total
    cursor.resetTo(cached.items.length)
    // And the CURSOR: `CachedPage` is {items, total} only, so keeping the one
    // the PREVIOUSLY-VIEWED query left walks that query's pages into this list
    // whenever the revalidation below fails ('reload' keeps state on failure).
    cursor.setCursor(undefined)
    setError(null)
    setHasFetched(true)
    // An 'initial' load for the PREVIOUS query may still be in flight. The
    // reload below bumps the generation, so that response is dropped — and
    // dropped responses skip their own cleanup, which would strand the
    // skeleton on over rows we can already show.
    setIsLoading(false)
    void loadFirstPage('reload')
    // `queryKey` (not `query`) is the dep on purpose: it is the serialised
    // shape, so a caller passing a fresh object literal each render doesn't
    // refetch. loadFirstPage reads the live query through a ref.
  }, [queryKey, enabled, loadFirstPage, pageCache, cursor])

  const loadMore = useCallback(() => {
    if (!enabled || inFlightRef.current) return
    // Gate on the REF, not the `total` state: state lags a render behind, so
    // a call landing between a load settling and the re-render would decide
    // using the previous total. Reading the ref also keeps this callback
    // stable, so a consumer's load-more handler prop stops changing every
    // time the total does.
    if (!cursor.hasMore(totalRef.current)) return
    const gen = genRef.current
    inFlightRef.current = true
    setIsLoadingMore(true)
    void (async () => {
      try {
        const page = await fetchPageRef.current({
          ...queryRef.current,
          limit: pageSize,
          ...cursor.nextPageParams(),
        })
        // A filter change (or refresh) mid-flight invalidates this page —
        // appending it would mix two different queries in one list.
        if (gen !== genRef.current) return
        setTotal(page.total)
        totalRef.current = page.total
        setItems((current) => mergeById(current, page.data, keyOfRef.current))
        cursor.advance(page.data.length)
        cursor.setCursor(page.next_cursor)
      } catch {
        // Non-fatal and deliberately not surfaced as a page-level error: the
        // list still holds valid rows. The next end-reach retries.
      } finally {
        if (gen === genRef.current) {
          inFlightRef.current = false
          setIsLoadingMore(false)
        }
      }
    })()
  }, [enabled, pageSize, cursor])

  const refresh = useCallback(async () => {
    // Same reason as the query effect: let loadFirstPage own the cursor, so a
    // failed refresh keeps items AND offset consistent with each other.
    await loadFirstPage('refresh')
  }, [loadFirstPage])
  const reload = useCallback(async () => {
    const result = await loadFirstPage('reload')
    return result.total
  }, [loadFirstPage])
  const reconcile = useCallback(async () => {
    const result = await loadFirstPage('refresh')
    return result.succeeded
  }, [loadFirstPage])
  const applyRealtimeItems = useCallback((nextItems: TItem[]) => {
    const supersededRequest = inFlightRef.current
    if (supersededRequest) {
      ++genRef.current
      inFlightRef.current = false
      setIsLoadingMore(false)
    }
    setItems((current) => {
      const delta = nextItems.length - current.length
      const nextTotal = Math.max(0, totalRef.current + delta)
      if (delta !== 0) {
        totalRef.current = nextTotal
        setTotal(nextTotal)
      }
      // Keep the active page-0 cache coherent with what is on screen. Without
      // this, switching filters and returning can briefly resurrect a gig a
      // realtime event removed (or hide one it inserted) until revalidation.
      pageCacheRef.current.remember(queryKeyRef.current, {
        items: nextItems,
        total: nextTotal,
      })
      return nextItems
    })
    // A request started before this event can carry an older DB snapshot.
    // Invalidate only that overlap, then reread after the committed event.
    if (supersededRequest) void loadFirstPage('reload')
  }, [loadFirstPage])

  return {
    items,
    total,
    // State total here, not the ref, so what is returned matches what was
    // rendered.
    hasMore: cursor.hasMore(total),
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasFetched,
    error,
    loadMore,
    refresh,
    reload,
    reconcile,
    applyRealtimeItems,
  }
}
