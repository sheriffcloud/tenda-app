/**
 * Where the next page starts — the offset/cursor half of usePaginatedList,
 * split out at #46 so neither file carries the 300-line exception.
 *
 * Two traversal modes behind one surface. OFFSET mode walks by count; CURSOR
 * mode sends the server's `next_cursor` and lets it decide, which is what keeps
 * traversal stable on a list that is shifting under the reader. The caller
 * picks with `cursorPagination` and then never branches on it again.
 *
 * Mutable state in refs, deliberately: every caller is an async closure that
 * must see the LIVE position, not the value captured when its render ran, and
 * the returned object is referentially stable so closing over it costs no
 * callback churn.
 */
import { useMemo, useRef } from 'react'
import { hasMorePages, nextOffset } from '@tenda/shared'
import type { PageParams } from './paginated-list.types'

export interface PageCursor {
  /** Rows already held — the reload branch checks this against a page size. */
  offset(): number
  /** Offset (and cursor, in cursor mode) for the next `loadMore` request. */
  nextPageParams(): Pick<PageParams, 'offset'> & { cursor?: string }
  /** Page 0 REPLACED the list: position is exactly what just arrived. */
  resetTo(count: number): void
  /**
   * Page 0 was MERGED into a longer list (reload past page 0). Never rewinds —
   * later pages are still loaded and a rewind would re-walk them. Deliberately
   * not advanced by the number of newly-prepended rows either: under-advancing
   * costs one redundant page (whose rows de-dupe away), whereas over-advancing
   * would skip rows the user never sees.
   */
  keepAtLeast(count: number): void
  /** A page was appended. */
  advance(count: number): void
  /** Record the server's cursor for the page just applied. */
  setCursor(next: string | null | undefined): void
  /** Back to the start, after an 'initial' load failed and cleared the rows. */
  clear(): void
  /** Whether another page exists, given the total the caller wants to trust. */
  hasMore(total: number): boolean
}

export function usePageCursor(cursorPagination: boolean): PageCursor {
  const offsetRef = useRef(0)
  const nextCursorRef = useRef<string | null | undefined>(undefined)

  return useMemo<PageCursor>(
    () => ({
      offset: () => offsetRef.current,
      nextPageParams: () => ({
        offset: cursorPagination && nextCursorRef.current !== undefined ? 0 : offsetRef.current,
        ...(cursorPagination && typeof nextCursorRef.current === 'string'
          ? { cursor: nextCursorRef.current }
          : {}),
      }),
      resetTo: (count) => {
        offsetRef.current = nextOffset(0, count)
      },
      keepAtLeast: (count) => {
        offsetRef.current = Math.max(offsetRef.current, count)
      },
      advance: (count) => {
        offsetRef.current = nextOffset(offsetRef.current, count)
      },
      setCursor: (next) => {
        nextCursorRef.current = next
      },
      clear: () => {
        offsetRef.current = 0
        // The CURSOR too. Cursor mode ignores the offset entirely (shared
        // `hasMorePages` answers `nextCursor !== null` once a cursor exists),
        // so resetting only the offset left the previous query's cursor
        // standing over an empty, errored list — which then reported another
        // page and would have fetched it under the dead query's cursor.
        // `undefined`, not `null`: that is the ref's initial value, and "back
        // to the start" has to mean the state a fresh hook starts in.
        nextCursorRef.current = undefined
      },
      hasMore: (total) =>
        hasMorePages({
          cursorPagination,
          nextCursor: nextCursorRef.current,
          offset: offsetRef.current,
          total,
        }),
    }),
    [cursorPagination],
  )
}
