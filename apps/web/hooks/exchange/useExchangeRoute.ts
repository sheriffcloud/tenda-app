'use client'

/**
 * The exchange surface's list state, read from the URL.
 *
 * All three keys live there rather than in component state. The tab and the
 * two filters describe a view worth linking to, and — the part that is a bug
 * rather than a nicety — opening an offer navigates to `/exchange/<id>`, which
 * UNMOUNTS this page. State held here would be reset by the time the reader
 * comes back, so the filtered book they were reading would silently become the
 * unfiltered one.
 *
 * Because the view is linkable, its keys arrive from OUTSIDE: a bookmark, a
 * shared link, or a chain that was enabled when the link was made and is not
 * now. `?cur=` is narrowed against the payout currencies; `?chain=` is narrowed
 * against the RUNNING registry, which is the rule `lib/gigs/search-params.ts`
 * already states for the feed — the server 400s an id it does not serve, so
 * forwarding one turns a stale link into "Offers could not be loaded" over a
 * Try-again that can never succeed.
 */
import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { selectChainById, useChainRegistryStore } from '@/stores/chain-registry.store'
import {
  exchangeCurrency,
  exchangeTab,
  type ExchangeRouteState,
} from '@/components/exchange/market/copy'

export interface ExchangeRoute {
  route: ExchangeRouteState
  /**
   * False only while a chain filter is present and the registry has not
   * answered yet. The lists wait on it rather than firing a request whose
   * filter may be about to be dropped — one skeleton, not a book that
   * repaints itself.
   */
  chainReady: boolean
}

export function useExchangeRoute(): ExchangeRoute {
  const search = useSearchParams()
  const chains = useChainRegistryStore((s) => s.chains)
  const status = useChainRegistryStore((s) => s.status)
  const ensureLoaded = useChainRegistryStore((s) => s.ensureLoaded)

  useEffect(() => {
    void ensureLoaded()
  }, [ensureLoaded])

  const rawChain = search.get('chain')
  const base = { tab: exchangeTab(search.get('tab')), currency: exchangeCurrency(search.get('cur')) }

  if (rawChain === null) return { route: { ...base, chainId: null }, chainReady: true }
  if (chains === null) {
    // A registry that gave up is not a reason to hide the book: forward what
    // the reader asked for and let the request answer, rather than waiting on
    // a fetch that has already failed.
    return { route: { ...base, chainId: rawChain }, chainReady: status === 'error' }
  }
  return {
    route: { ...base, chainId: selectChainById(chains, rawChain) === null ? null : rawChain },
    chainReady: true,
  }
}
