/**
 * The page-zero cache, as a hook of its own (#54). Mirrors web's
 * hooks/pagination/usePageCache (#46) with one deliberate difference: this
 * cache is INSTANCE-scoped — `useRef(createQueryCache())`, no caller-owned
 * `cache` option — because mobile has no equivalent of the workspace list
 * column that Next remounts on every row opened. It dies with the screen.
 *
 * THERE IS NO `rememberForAccount` HERE, AND THAT RESTS ON AN INVARIANT (#55):
 * only VIEWER-INDEPENDENT lists may enable caching. Web needs the guard because
 * its cache is caller-owned and deliberately outlives the hook (#45), and its
 * list columns include account-scoped ones. Mobile's cannot leak one account's
 * rows to another for a simpler reason than lifetime — nothing account-scoped
 * is in it.
 *
 * Viewer-independent, NOT "public" — the test is whether the route's answer can
 * vary by who asks, and one of the two does require auth. Both were checked at
 * the route, and neither handler reads `request.user` at all:
 *
 *   useHomeFeed        api.gigs.list      routes/v1/gigs/public-feed.ts — filters
 *                                         `hidden = false` for every caller; an
 *                                         owner reaches taken-down rows only via
 *                                         `?mine=`, which this caller never sends
 *   useExchangeScreen  api.exchange.list  routes/v1/exchange/index.ts — WHERE is
 *                                         kind/status/hidden/accept_deadline plus
 *                                         query filters; auth is required only to
 *                                         keep the book off scrapers, and
 *                                         `toExchangeSummary` maps the row alone
 *
 * and every account-scoped list leaves it off: useExchangeScreen's myTrades
 * (api.users.escrows), useMyGigs, useMyDisputes, useDraftGigs, useWalletScreen.
 *
 * SO: adding `cacheQueries: true` to an account-scoped list is not a
 * performance tweak, it is the bug #45 describes. Add the account guard first.
 * And when adding it to a NEW list, check its ROUTE for `request.user`, not
 * just whether the screen feels public.
 */
import { useMemo, useRef } from 'react'
import { createQueryCache, readPage, rememberPage, type CachedPage } from '@tenda/shared'

export interface PageCache<TItem> {
  /** Remembered page zero for `key`, or undefined (also when caching is off). */
  read(key: string): CachedPage<TItem> | undefined
  /** Record page zero for `key`. */
  remember(key: string, page: CachedPage<TItem>): void
}

export function usePageCache<TItem>(cacheQueries: boolean): PageCache<TItem> {
  const cacheRef = useRef(createQueryCache<TItem>())

  // Identity changes ONLY when caching itself flips, so callbacks in the
  // paging hook can close over this without gaining a churning dependency.
  return useMemo<PageCache<TItem>>(
    () => ({
      read: (key) => (cacheQueries ? readPage(cacheRef.current, key) : undefined),
      remember: (key, page) => {
        if (cacheQueries) rememberPage(cacheRef.current, key, page)
      },
    }),
    [cacheQueries],
  )
}
