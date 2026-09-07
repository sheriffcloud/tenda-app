/**
 * The exchange surface's shared vocabulary: its strings, its URL helpers, and
 * the one card treatment both of its rows wear.
 *
 * All three pieces of list state — tab, currency, chain — live in the URL, and
 * these build every link that carries them. Two reasons, and the second is the
 * one that bites: a filtered order book is worth sharing, and opening an offer
 * UNMOUNTS this page, so a filter held in component state is gone by the time
 * the reader comes back to the list they were reading.
 */
import {
  ASSET_META,
  CURRENCY_META,
  PAYOUT_CURRENCIES,
  type SupportedCurrency,
} from '@tenda/shared'
import { DEFAULT_EXCHANGE_TAB, type ExchangeTab } from './tabs'

export { EXCHANGE_TABS, exchangeTab, DEFAULT_EXCHANGE_TAB, type ExchangeTab } from './tabs'

export interface ExchangeRouteState {
  tab: ExchangeTab
  /**
   * A payout currency, or null for "all currencies". Narrowed to the rails the
   * product actually settles in rather than kept as free text: `?cur=` is
   * reader-editable, and forwarding an unknown code would ask the server to
   * filter by something no offer can carry.
   */
  currency: SupportedCurrency | null
  /** CAIP-2 chain id, or null for "all chains". */
  chainId: string | null
}

/**
 * The surface's route carrying whichever keys are not default. The defaults
 * stay off the URL so one view has one address — the same rule the my-gigs
 * column follows, and what keeps `alternates.canonical` honest elsewhere.
 */
export function exchangeHref({ tab, currency, chainId }: ExchangeRouteState): string {
  const params = new URLSearchParams()
  if (tab !== DEFAULT_EXCHANGE_TAB) params.set('tab', tab)
  if (currency !== null) params.set('cur', currency)
  if (chainId !== null) params.set('chain', chainId)
  const query = params.toString()
  return query === '' ? '/exchange' : `/exchange?${query}`
}

/** The rate line under an offer's headline figure, e.g. "NGN / USDC". */
export function rateUnitLabel(fiatCurrency: string, asset: string): string {
  return `${fiatCurrency} / ${ASSET_META[asset]?.symbol ?? asset}`
}

/** A currency chip's label — the symbol and the code, as the comp writes it. */
export function currencyChipLabel(currency: SupportedCurrency): string {
  return `${CURRENCY_META[currency].symbol} ${currency}`
}

/** `?cur=` narrowed to a payout currency; anything else is "all currencies". */
export function exchangeCurrency(raw: string | null): SupportedCurrency | null {
  return PAYOUT_CURRENCIES.find((currency) => currency === raw) ?? null
}

/**
 * One card treatment for both rows of this surface.
 *
 * The order-book row and the my-trades row are the same object at two
 * densities, and they carried these thirteen utilities twice — so a hover or
 * a motion token changed on one silently left the other behind. The layout
 * differs (`block` vs a flex row) and stays with each card.
 */
/** Hairlines, not shadows (#60 cards pass): the rule lifts on hover, nothing floats. */
export const EXCHANGE_ROW_CLASS =
  'rounded-card border border-border-subtle bg-surface-card p-5 text-content-primary transition-[border-color] duration-(--motion-fast) ease-(--motion-ease-standard) hover:border-border-strong hover:no-underline'

export const EXCHANGE_COPY = {
  eyebrow: 'Exchange',
  /**
   * The comp titles this per side ("Buy USDC from a trader"). There is one
   * side (#32) and the asset is not always USDC (#37), so the market title
   * names the act without naming a ticker the wire may contradict.
   */
  title: (tab: ExchangeTab) =>
    tab === 'market' ? 'Buy crypto from a trader' : 'Trades you are in',
  postOffer: 'Post offer',
  /** The comp's count line, which says what the number counts. */
  count: (total: number, currency: string | null) =>
    `${total} ${total === 1 ? 'offer' : 'offers'}${currency === null ? '' : ` in ${currency}`}`,
  myTradesCount: (total: number) => `${total} ${total === 1 ? 'trade' : 'trades'}`,
  allCurrencies: 'All',
  currencyGroupLabel: 'Filter by currency',
  tabGroupLabel: 'Exchange lists',
  /**
   * The comp badges row one "Best" and numbers the rows 01, 02, 03 — both of
   * which claim the book is ranked by rate. It is ordered by listing time and
   * paginated (#35), so the ordering is stated instead of implied.
   */
  ordering: 'Newest offers first. Rates are the trader’s own — compare them straight down the column.',
  market: {
    /**
     * "No offers in this pair" was the title in every empty case, including
     * the one where nothing is filtering and there is no pair to speak of.
     */
    emptyTitle: (filtered: boolean) =>
      filtered ? 'No offers match these filters' : 'No offers on the market yet',
    /**
     * Why the book is empty, named by the filter that actually narrowed it.
     * "Clear the chain filter" is useless advice to a reader who set only a
     * currency — and on a single-chain deployment that row is not even
     * rendered, so it points at a control that is not on the screen.
     */
    emptyBody: (currency: string | null, chainId: string | null) =>
      currency !== null && chainId !== null
        ? 'Nobody is quoting this currency on this chain right now. Try another currency, or clear the chain filter.'
        : currency !== null
          ? 'Nobody is quoting this currency right now. Try another one, or clear it to see the whole book.'
          : 'Nobody is quoting on this chain right now. Clear the chain filter to see the whole book.',
    emptyUnfilteredBody: 'Nobody is quoting the market right now. Check back shortly.',
    errorTitle: 'Offers could not be loaded',
    errorBody:
      'Your balance and any open trade are unaffected. This is a read failure on the offer index.',
    label: 'Open offers',
  },
  mine: {
    /**
     * This list IS narrowed — `useExchangeScreen` passes `chain_id` to
     * /v1/users/:id/escrows — so an empty one can mean "none on this chain"
     * rather than "none at all". Only the CHAIN can narrow it: there is no
     * currency parameter on that wire, so `?cur=` must not be blamed here.
     */
    emptyTitle: (chainFiltered: boolean) =>
      chainFiltered ? 'No trades on this chain' : 'No trades yet',
    emptyBody: (chainFiltered: boolean) =>
      chainFiltered
        ? 'Your trades on other chains are still here. Clear the chain filter to see them.'
        : 'Offers you post, and offers you accept, both appear here.',
    errorTitle: 'Your trades could not be loaded',
    errorBody: 'Nothing has changed on-chain. This is a read failure on your own trade list.',
    label: 'Your trades',
  },
  /** Which side of a trade the reader is on, derived from the escrow's creator. */
  side: (selling: boolean) => (selling ? 'You are selling' : 'You are buying'),
  window: (window: string) => `Pay within ${window}`,
} as const
