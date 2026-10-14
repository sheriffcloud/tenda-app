/**
 * The two ways to turn crypto into fiat, and the `?mode=` that selects one.
 *
 * The comp's chips read "Buy / Sell" — one market, two directions. There is no
 * Buy: onramp was retired in #61 (spec-correction #1), so the surface is
 * "Sell crypto" and the two chips carry what the reader actually has a choice
 * between: the market rate now, or their own rate posted as an offer.
 *
 * Its own module so the copy and the tab row can both import it without a
 * cycle — the same shape as `exchange/market/tabs.ts` and `my-gigs/tabs.ts`.
 */
export type SellMode = 'instant' | 'offer'

export const SELL_MODES: readonly { key: SellMode; label: string }[] = [
  { key: 'instant', label: 'Instant' },
  { key: 'offer', label: 'Create offer' },
]

/** The default mode — what a bare `/wallet/buy-sell` shows, never in the URL. */
export const DEFAULT_SELL_MODE: SellMode = 'instant'

/** A `?mode=` value narrowed to a real mode; anything else is the default. */
export function sellMode(raw: string | null): SellMode {
  return SELL_MODES.find((m) => m.key === raw)?.key ?? DEFAULT_SELL_MODE
}
