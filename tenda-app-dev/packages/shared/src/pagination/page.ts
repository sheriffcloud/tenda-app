/**
 * Pure page-arithmetic helpers. Kept side-effect-free and React-free so the
 * tricky parts of offset pagination are unit-testable in isolation and shared
 * by BOTH pagination shapes in the app (offset lists and the cursor-paginated
 * notification feed).
 */

/**
 * Append `incoming` to `existing`, dropping any row whose key is already
 * present.
 *
 * Offset pagination over a newest-first list is inherently racy: a row
 * inserted between page 1 and page 2 shifts the window, so the server can
 * legitimately return a row the client already holds. Appending blindly
 * yields duplicate React keys (and a visibly repeated card), so every append
 * path goes through here.
 *
 * Order is preserved: existing rows keep their position, and new rows arrive
 * in server order. The FIRST occurrence wins — a row already on screen is not
 * replaced mid-scroll, which would make content jump under the user's thumb.
 */
export function mergeById<T>(
  existing: readonly T[],
  incoming: readonly T[],
  keyOf: (item: T) => string,
): T[] {
  if (incoming.length === 0) return existing as T[]
  const seen = new Set(existing.map(keyOf))
  const fresh: T[] = []
  for (const item of incoming) {
    const key = keyOf(item)
    // Guard against duplicates WITHIN the incoming page too, not just against
    // what's already loaded — a shifted window can repeat a row in one batch.
    if (seen.has(key)) continue
    seen.add(key)
    fresh.push(item)
  }
  return fresh.length === 0 ? (existing as T[]) : [...existing, ...fresh]
}

/**
 * Whether another page exists, given the offset the NEXT request would use
 * and the server's total.
 *
 * Deliberately driven by the offset cursor rather than `items.length`:
 * de-duplication (above) makes those two diverge, and deriving the cursor
 * from array length would then skip rows silently. `PaginatedResponse.has_more`
 * is not used — it is declared in the shared contract but no server route
 * populates it, so trusting it would stall every list after one page.
 */
export function hasMore(nextOffset: number, total: number): boolean {
  return nextOffset < total
}

/**
 * The offset for the next request. Advances by what the server actually
 * RETURNED, not by the page size and not by the de-duplicated count — the
 * server's window is what the cursor has to track.
 *
 * A short page (fewer rows than asked for) still advances by its real length;
 * `hasMore` is what stops the walk, so a truncated final page terminates
 * cleanly instead of re-requesting the same tail forever.
 */
export function nextOffset(currentOffset: number, returnedCount: number): number {
  return currentOffset + returnedCount
}

/** What `hasMorePages` needs to decide, from either pagination shape. */
export interface HasMoreArgs {
  /** Cursor traversal, for a live list whose offsets shift under the reader. */
  cursorPagination: boolean
  /**
   * The server's cursor for the next page:
   *   • `undefined` — this server does not send one, so fall back to offsets
   *   • `null`      — the server says this is the end
   *   • a string    — there is another page
   */
  nextCursor: string | null | undefined
  offset: number
  total: number
}

/**
 * Whether another page exists under EITHER shape — the cursor-aware sibling of
 * `hasMore`, and the one both clients' `usePaginatedList` ask.
 *
 * It lives here rather than in a client because the rule was written FOUR
 * times: each client had it twice, once negated as the load-more guard and
 * once positively as the returned `hasMore`, in two different shapes that
 * happened to agree on every input. Nothing made them agree.
 *
 * The `total` argument is what the callers legitimately differ on: the guard
 * passes a ref (state lags a render behind, so a call landing between a load
 * settling and the re-render would decide on the old total), and the returned
 * value passes state (so what is returned matches what was rendered).
 */
export function hasMorePages({
  cursorPagination,
  nextCursor,
  offset,
  total,
}: HasMoreArgs): boolean {
  if (!cursorPagination || nextCursor === undefined) return hasMore(offset, total)
  return nextCursor !== null
}
