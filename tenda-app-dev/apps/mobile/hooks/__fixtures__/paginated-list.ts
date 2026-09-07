/**
 * Builds a `PaginatedListState` for component tests, so every list-rendering
 * component test states only the fields it actually cares about instead of
 * re-declaring the full controller shape (and drifting when it changes).
 */
import type { PaginatedListState } from '@/hooks/usePaginatedList'

export function listState<T>(
  overrides: Partial<PaginatedListState<T>> = {},
): PaginatedListState<T> {
  const items = overrides.items ?? []
  return {
    items,
    total: items.length,
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    isRefreshing: false,
    // Default to settled — a component test asserting an empty state is
    // almost always describing "loaded, nothing there".
    hasFetched: true,
    error: null,
    loadMore: jest.fn(),
    refresh: jest.fn(async () => {}),
    reload: jest.fn(async () => items.length),
    reconcile: jest.fn(async () => true),
    applyRealtimeItems: jest.fn(),
    ...overrides,
  }
}
