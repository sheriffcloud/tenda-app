/**
 * Web port of apps/mobile/hooks/useExchangeScreen.ts: the public order
 * book and the caller's own trades, each independently paginated.
 *
 * The filters arrive as ARGUMENTS rather than living here. They ride the URL
 * (`useExchangeRoute`), because opening an offer unmounts this surface and
 * local state would drop the reader's filters on the way back. Both lists load
 * whichever tab is showing, so the inactive tab's count is a real server total
 * rather than a zero for a list nobody fetched — the same rule My Gigs follows.
 *
 * Mobile's focus refresh has no web analogue (the page remounts per navigation).
 */
import type {
  EscrowListRow,
  ExchangeListQuery,
  ExchangeSummary,
  SupportedCurrency,
} from '@tenda/shared'
import { api } from '@/api/client'
import { usePaginatedList, type PaginatedListState } from '@/hooks/pagination/usePaginatedList'
import { offerBookCache } from '@/lib/account-state'
import { useMyTrades } from './useMyTrades'

export interface ExchangeScreenState {
  market: PaginatedListState<ExchangeSummary>
  myTrades: PaginatedListState<EscrowListRow>
}

export interface ExchangeScreenFilters {
  currency: SupportedCurrency | null
  chainId: string | null
  /**
   * False while the chain registry has not yet verified a `?chain=` filter
   * from the URL (#50 removed the old advanced-mode lock) — firing early
   * would turn a stale link into an error over a dead Try-again.
   */
  enabled?: boolean
}

const offerKey = (offer: ExchangeSummary) => offer.escrow_id

export function useExchangeScreen({
  currency,
  chainId,
  enabled = true,
}: ExchangeScreenFilters): ExchangeScreenState {
  const market = usePaginatedList<ExchangeSummary, ExchangeListQuery>({
    fetchPage: (params) => api.exchange.list(params),
    query: {
      currency: currency ?? undefined,
      chain_id: chainId ?? undefined,
    },
    keyOf: offerKey,
    enabled,
    cache: offerBookCache,
  })

  // The reader's own side of the book, shared with the dashboard (#60).
  const myTrades = useMyTrades(chainId, enabled)

  return { market, myTrades }
}
