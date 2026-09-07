/**
 * Shared helpers for the usePaginatedList suites, which are split by concern
 * (loading, refresh semantics, caching, cursors) to stay inside the 300-line
 * limit. Pure data and promise plumbing — no `vi.mock`, so importing this
 * cannot affect a suite's module registry.
 */
import type { PaginatedResponse } from '@tenda/shared'

export interface Row {
  id: string
}

export const keyOf = (r: Row) => r.id
export const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }))

/** An offset-paginated page. */
export function page(data: Row[], total: number, offset = 0): PaginatedResponse<Row> {
  return { data, total, limit: 20, offset }
}

/** A cursor-paginated page, for the live-list traversal the server drives. */
export function cursorPage(data: Row[], next_cursor: string | null): PaginatedResponse<Row> {
  return { data, total: 4, limit: 2, offset: 0, next_cursor }
}
