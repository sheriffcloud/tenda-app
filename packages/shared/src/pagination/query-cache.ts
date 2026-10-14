/**
 * Bounded per-query memo of page 0, so re-selecting a filter the user has
 * already viewed paints from memory instead of blanking the list body for a
 * round-trip. Tapping back and forth across the chain chips is the motivating
 * case: every tap was a fresh fetch with nothing on screen in between.
 *
 * Page 0 ONLY. Later pages are scroll state, not something worth restoring,
 * and a seeded cursor claiming pages the list no longer holds would SKIP rows
 * on the next end-reach. The consumer re-reads offset 0 on every hit anyway
 * (silently), so a cached entry is a first frame, never the final answer.
 */

/** Remembered page 0 for one serialised query shape. */
export interface CachedPage<TItem> {
  items: TItem[]
  /** Server-authoritative total for that query, not `items.length`. */
  total: number
}

export type QueryCache<TItem> = Map<string, CachedPage<TItem>>

/**
 * Entries kept before the least-recently-used one is evicted. Sized for the
 * realistic breadth of one session's filter combinations (a few chains × a few
 * categories, plus search variants); the rows are list summaries, not
 * documents, so the ceiling is about bounding staleness, not memory.
 */
export const QUERY_CACHE_LIMIT = 12

export const createQueryCache = <TItem,>(): QueryCache<TItem> => new Map()

/** Records (or refreshes) the page-0 result for `key`, evicting the LRU entry. */
export function rememberPage<TItem>(
  cache: QueryCache<TItem>,
  key: string,
  page: CachedPage<TItem>,
): void {
  // Delete-then-set so Map insertion order tracks RECENCY — that is what makes
  // evicting `keys().next()` an LRU rather than a FIFO that could drop the
  // filter the user is actively toggling against.
  cache.delete(key)
  cache.set(key, page)
  if (cache.size > QUERY_CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (oldest.done !== true) cache.delete(oldest.value)
  }
}

/** Reads page 0 for `key`, counting the read as a use for eviction order. */
export function readPage<TItem>(
  cache: QueryCache<TItem>,
  key: string,
): CachedPage<TItem> | undefined {
  const page = cache.get(key)
  if (page === undefined) return undefined
  rememberPage(cache, key, page)
  return page
}
