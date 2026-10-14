/**
 * The caller-owned page-zero cache, as a hook of its own.
 *
 * Split out of usePaginatedList (#46), along with usePageCursor. This half has
 * its own concepts (QueryCache, createQueryKey, readPage/rememberPage), its own
 * test file, and no involvement in the paging state machine's refs. What stays
 * in the hook is the load/reload/refresh state machine — which is the hook.
 *
 * WHY A CALLER-OWNED CACHE AT ALL: it makes page zero outlive the hook's own
 * lifetime, which is the whole point for a workspace list column. Next REMOUNTS
 * the @list slot when the route moves between its entries, so every row opened
 * rebuilt the list from scratch and the column blinked through a skeleton —
 * measured as ["rows:1", "SKELETON", "rows:1"]. Supplying a cache implies
 * caching; `cacheQueries` alone still means "remember, for this instance".
 */
import { useMemo, useRef } from 'react'
import { createQueryCache, readPage, rememberPage, type CachedPage, type QueryCache } from '@tenda/shared'
import { isSameAccount } from '@/lib/account-state'

export interface PageCache<TItem> {
  /** Remembered page zero for `key`, or undefined (also when caching is off). */
  read(key: string): CachedPage<TItem> | undefined
  /** Record page zero. For synchronous callers, where no account switch can interleave. */
  remember(key: string, page: CachedPage<TItem>): void
  /**
   * Record page zero from an ASYNC caller, dropping the write if the account
   * changed while the request was in flight (#45): this cache outlives the
   * session, so the paging hook's own generation counter cannot protect it.
   */
  rememberForAccount(key: string, page: CachedPage<TItem>, account: number): void
}

export function usePageCache<TItem>({
  cacheQueries = false,
  cache,
}: {
  cacheQueries?: boolean
  cache?: QueryCache<TItem>
}): PageCache<TItem> {
  const enabled = cacheQueries || cache !== undefined
  // First cache wins for the hook's lifetime, matching the pre-split behaviour.
  const cacheRef = useRef(cache ?? createQueryCache<TItem>())

  // Identity changes ONLY when caching itself flips, so callbacks in the paging
  // hook can close over this without gaining a dependency that churns every
  // render — and the query effect, which DOES need to re-run when caching
  // flips, gets that by listing the object.
  return useMemo<PageCache<TItem>>(
    () => ({
      read: (key) => (enabled ? readPage(cacheRef.current, key) : undefined),
      remember: (key, page) => {
        if (enabled) rememberPage(cacheRef.current, key, page)
      },
      rememberForAccount: (key, page, account) => {
        if (enabled && isSameAccount(account)) rememberPage(cacheRef.current, key, page)
      },
    }),
    [enabled],
  )
}
