/**
 * Home-feed controller: filter state + the paginated gig list + polling.
 *
 * Search moved SERVER-side here (`GigListQuery.q`, backed by the
 * `gig_details.search_vector` full-text index). It used to filter the loaded
 * array in JS, which was already only a partial answer and becomes actively
 * misleading once the feed pages — you'd be searching 20 of N gigs.
 */
import { useCallback, useState } from 'react'
import type { GigCategory, GigListQuery, GigSummary } from '@tenda/shared'
import { api } from '@/api/client'
import { usePaginatedList, type PaginatedListState } from '@/hooks/usePaginatedList'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useGigsFeedPolling } from '@/hooks/useGigsFeedPolling'
import { useGigFeedRealtimeSubscription } from '@/features/gig-feed/useGigFeedRealtimeSubscription'
import { useGigDeadlineReconciliation } from '@/features/gig-feed/useGigDeadlineReconciliation'

export interface HomeFeedFilters {
  query: string
  category: GigCategory | null
  country: string | null
  city: string | null
  remote: boolean | null
  crossBorder: boolean | null
  chainId: string | null
}

const EMPTY_FILTERS: HomeFeedFilters = {
  query: '',
  category: null,
  country: null,
  city: null,
  remote: null,
  crossBorder: null,
  chainId: null,
}

export interface HomeFeed {
  list: PaginatedListState<GigSummary>
  filters: HomeFeedFilters
  /** True when any filter narrows the feed (drives the dot + "clear" CTA). */
  hasFilters: boolean
  setFilter: <K extends keyof HomeFeedFilters>(key: K, value: HomeFeedFilters[K]) => void
  setLocation: (country: string, city: string | null) => void
  clearAll: () => void
}

const keyOf = (gig: GigSummary) => gig.escrow_id

export function useHomeFeed(): HomeFeed {
  const [filters, setFilters] = useState<HomeFeedFilters>(EMPTY_FILTERS)

  // Only the free-text box needs debouncing — chips/pickers are discrete taps.
  const debouncedQuery = useDebouncedValue(filters.query)

  // Undefined (not null) for unset keys: the request serialiser omits
  // undefined, so an unset filter sends no param at all.
  const query: GigListQuery = {
    q: debouncedQuery.trim() === '' ? undefined : debouncedQuery.trim(),
    category: filters.category ?? undefined,
    country: filters.country ?? undefined,
    city: filters.city ?? undefined,
    remote: filters.remote ?? undefined,
    cross_border: filters.crossBorder ?? undefined,
    chain_id: filters.chainId ?? undefined,
  }

  const list = usePaginatedList<GigSummary, GigListQuery>({
    fetchPage: (params) => api.gigs.list(params),
    query,
    keyOf,
    // The chip rows (category + settlement chain) are tapped back and forth,
    // and this feed is read-only — so a remembered page 0 makes a revisited
    // filter instant, with a silent revalidate right behind it.
    cacheQueries: true,
    cursorPagination: true,
  })

  useGigsFeedPolling({ reload: list.reload })
  useGigFeedRealtimeSubscription(list, query)
  useGigDeadlineReconciliation(list.items, list.reconcile)

  const setFilter = useCallback(
    <K extends keyof HomeFeedFilters>(key: K, value: HomeFeedFilters[K]) => {
      setFilters((current) => ({ ...current, [key]: value }))
    },
    [],
  )

  const setLocation = useCallback((country: string, city: string | null) => {
    setFilters((current) => ({ ...current, country, city }))
  }, [])

  const clearAll = useCallback(() => setFilters(EMPTY_FILTERS), [])

  const hasFilters =
    filters.query.trim() !== '' ||
    filters.category !== null ||
    filters.country !== null ||
    filters.city !== null ||
    filters.remote !== null ||
    filters.crossBorder !== null ||
    filters.chainId !== null

  return { list, filters, hasFilters, setFilter, setLocation, clearAll }
}
