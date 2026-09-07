/**
 * The two lists the exchange surface holds, and the `?tab=` that selects one.
 *
 * The Tier-3 comp puts a two-chip toggle here reading "Buy USDC / Sell USDC",
 * flipping ONE index between the two sides of a market. Our order book has no
 * such pair: `/v1/exchange` serves exactly one kind of row — an escrow whose
 * creator has already locked crypto and wants fiat for it — and the reader is
 * always the taker. There is no buy-side index to toggle to, so the chips
 * carry what the reader actually has two of: the market, and their own trades
 * (mobile's Market | My Trades). Spec-correction #32.
 *
 * Its own module so the copy and the filter row can both import it without a
 * cycle, exactly like `my-gigs/tabs.ts`.
 */
export type ExchangeTab = 'market' | 'mine'

export const EXCHANGE_TABS: readonly { key: ExchangeTab; label: string }[] = [
  { key: 'market', label: 'Market' },
  { key: 'mine', label: 'My trades' },
]

/** The default tab — the one a bare `/exchange` shows, and never in the URL. */
export const DEFAULT_EXCHANGE_TAB: ExchangeTab = 'market'

/** A `?tab=` value narrowed to a real tab; anything else is the default. */
export function exchangeTab(raw: string | null): ExchangeTab {
  return EXCHANGE_TABS.find((tab) => tab.key === raw)?.key ?? DEFAULT_EXCHANGE_TAB
}
