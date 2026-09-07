import type { PaginatedResponse, QueryCache } from '@tenda/shared'

export interface PageParams {
  limit: number
  offset: number
  cursor?: string
}

export interface FirstPageResult {
  total: number
  succeeded: boolean
}

export interface UsePaginatedListOptions<TItem, TQuery extends object> {
  fetchPage: (params: TQuery & PageParams) => Promise<PaginatedResponse<TItem>>
  query: TQuery
  keyOf: (item: TItem) => string
  pageSize?: number
  enabled?: boolean
  /** Cache page zero by serialized query and silently revalidate cache hits. */
  cacheQueries?: boolean
  /**
   * A cache the CALLER owns, so page zero survives this hook unmounting —
   * the workspace's list columns are remounted by the router on every row
   * they open. Implies `cacheQueries`.
   */
  cache?: QueryCache<TItem>
  /** Use server next_cursor for stable traversal of a live, shifting list. */
  cursorPagination?: boolean
}

export interface PaginatedListState<TItem> {
  items: TItem[]
  total: number
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  isRefreshing: boolean
  hasFetched: boolean
  error: string | null
  loadMore(): void
  refresh(): Promise<void>
  reload(): Promise<number>
  /** Replace with server truth and report whether the request succeeded. */
  reconcile(): Promise<boolean>
  applyRealtimeItems(items: TItem[]): void
}
