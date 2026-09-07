/**
 * Trade-screen controller: the public order book and the caller's own trades,
 * each independently paginated, plus the shared currency/chain filters.
 *
 * Both pages own their loading state, which fixes the pager sharing ONE
 * `refreshing` flag (the spinner used to appear on the tab you weren't
 * refreshing). Fetching is driven purely by the list controllers' query
 * effects — the old screen called its loaders from `scrollToPage` AND from a
 * `useFocusEffect` keyed on `pageIndex`, firing every tab switch twice.
 *
 * Both pages do re-read page 0 on every LATER focus, though. Trade is a tab, so
 * it stays mounted for the session: without it, posting an offer or accepting
 * one left the order book and My Trades showing pre-action state indefinitely.
 */
import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import type { EscrowListRow, ExchangeListQuery, ExchangeSummary, UserEscrowsQuery } from '@tenda/shared'
import { api } from '@/api/client'
import { usePaginatedList, type PaginatedListState } from '@/hooks/usePaginatedList'
import { useAuthStore } from '@/stores/auth.store'

export interface ExchangeScreenState {
  market: PaginatedListState<ExchangeSummary>
  myTrades: PaginatedListState<EscrowListRow>
  currency: string | null
  chainId: string | null
  setCurrency: (currency: string | null) => void
  setChainId: (chain_id: string | null) => void
  clearFilters: () => void
}

const offerKey = (offer: ExchangeSummary) => offer.escrow_id
const escrowKey = (row: EscrowListRow) => row.id

export function useExchangeScreen(): ExchangeScreenState {
  const user = useAuthStore((s) => s.user)
  const [currency, setCurrency] = useState<string | null>(null)
  const [chainId, setChainId] = useState<string | null>(null)

  const market = usePaginatedList<ExchangeSummary, ExchangeListQuery>({
    fetchPage: (params) => api.exchange.list(params),
    query: {
      currency: currency ?? undefined,
      chain_id: chainId ?? undefined,
    },
    keyOf: offerKey,
    // Read-only order book behind currency + chain chips: same back-and-forth
    // tapping as the home feed, so remember page 0 per filter combination.
    cacheQueries: true,
  })

  const userId = user?.id ?? null
  const myTrades = usePaginatedList<EscrowListRow, UserEscrowsQuery>({
    // No role filter → both sides: offers posted (creator) and offers
    // accepted (counterparty). The row derives selling/buying from creator_id.
    fetchPage: (params) => api.users.escrows({ id: userId ?? '' }, params),
    query: { kind: 'exchange', chain_id: chainId ?? undefined },
    keyOf: escrowKey,
    // Never issue the request without an id — it would 403 on someone else's
    // escrows rather than simply not running.
    enabled: userId !== null,
  })

  // Mirrored into refs so the focus callback's identity never changes when a
  // list settles — that would re-fire the effect and turn the first load into
  // two, which is exactly the double-fetch this screen was cleaned of.
  const marketFetchedRef = useRef(false)
  marketFetchedRef.current = market.hasFetched
  const myTradesFetchedRef = useRef(false)
  myTradesFetchedRef.current = myTrades.hasFetched

  useFocusEffect(
    useCallback(() => {
      // Page 0 is owned by each controller's query effect (mount, gate opening,
      // filter change), so only a LATER focus re-reads here. `reload` is the
      // silent, preserve-loaded-pages variant: no spinner over a list the user
      // is already looking at, and no yank back to page 0 if they scrolled.
      if (marketFetchedRef.current) void market.reload()
      if (myTradesFetchedRef.current) void myTrades.reload()
      // Both `reload`s are stable (see usePaginatedList) and the flags are read
      // through refs, so the callback deliberately has no deps — it must fire
      // on focus, not on every settled load.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  const clearFilters = useCallback(() => {
    setCurrency(null)
    setChainId(null)
  }, [])

  return { market, myTrades, currency, chainId, setCurrency, setChainId, clearFilters }
}
