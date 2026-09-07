/**
 * Money-display rules shared by every client (mobile + web) — moved here from
 * apps/mobile/lib/currency.ts so amount/fiat/window formatting cannot drift
 * between the apps. Display only: never use these values for math.
 */
import { amountRawToDisplay, getAssetMeta } from '../constants/assets'
import {
  CURRENCY_META,
  DEFAULT_CURRENCY,
  isSupportedCurrency,
  type SupportedCurrency,
} from '../constants/currencies'
import type { ExchangeRates } from '../api/contracts/platform.contract'

/** The platform rate cache's shape, taken from the wire type rather than restated. */
export type RateMap = ExchangeRates['rates']

/**
 * Fiat per DISPLAY UNIT of `asset`, or null while it is unknown.
 *
 * The cache holds ONE number per currency and it is fiat-per-SOL. So exactly
 * two kinds of asset can be priced from it:
 *
 *   SOL      — the rate is already what we want;
 *   a STABLE — worth ~1 USD, so the USD leg divides out
 *              (NGN-per-USDC = rates.NGN / rates.USD).
 *
 * Everything else answers null, and that third arm is load-bearing rather than
 * defensive. Mobile's copy of this rule returned the SOL rate for ANY
 * non-stable, which prices an ETH amount as though a unit of ETH were a unit of
 * SOL — wrong by whatever the two are worth relative to each other, which is a
 * money error rather than a rounding one. It is not hypothetical on the display
 * side: a card renders whatever `asset` the wire carries, and `gigBudgetRails`
 * has rails for native tokens ("0.001–10,000 for a native token"). Whether the
 * composer's picker offers one today is #81's question, not answered here. No
 * number beats a wrong one either way.
 *
 * Keyed on `symbol`, not the asset id, so SOL_DEVNET prices like SOL — which is
 * also what the old `toAssetPaymentDisplay` compared, so the native path is
 * unchanged for every asset it already handled.
 */
export function fiatRatePerUnit(
  rates: RateMap | null,
  currency: SupportedCurrency,
  asset: string,
): number | null {
  const solRate = rates?.[currency] ?? null
  const meta = getAssetMeta(asset)
  if (meta?.is_stable === true) {
    const usdRate = rates?.USD ?? null
    return solRate !== null && usdRate !== null && usdRate > 0 ? solRate / usdRate : null
  }
  return meta?.symbol === 'SOL' ? solRate : null
}

export interface AssetPaymentDisplay {
  /**
   * Display units (raw / 10^decimals), or null when this build has no metadata
   * for the asset and therefore does not know its decimals. Render the shared
   * `UNKNOWN_AMOUNT_DISPLAY` rather than a number in that case — base units are
   * not an approximation of the amount, they are wrong by 10^decimals.
   */
  amount: number | null
  symbol: string
  /** Fiat equivalent, null while the rate this asset needs is unknown. */
  fiat: number | null
}

/**
 * Asset-aware payment display for v2 escrows.
 *
 * Takes the rate CACHE and the currency, not a single rate: pricing a stable
 * needs the USD leg as well as the target currency, so a caller holding one
 * number cannot supply enough (#76). Every caller already held the cache.
 */
export function toAssetPaymentDisplay(
  amount_raw: string,
  asset: string,
  rates: RateMap | null,
  currency: SupportedCurrency,
): AssetPaymentDisplay {
  const amount = amountRawToDisplay(amount_raw, asset)
  const symbol = getAssetMeta(asset)?.symbol ?? asset
  const perUnit = fiatRatePerUnit(rates, currency, asset)
  const fiat = amount !== null && perUnit !== null && perUnit > 0 ? amount * perUnit : null
  return { amount, symbol, fiat }
}

/** Format a SOL amount (already in SOL, not lamports) as a display string, e.g. "0.05 SOL" */
export function formatSolDisplay(sol: number): string {
  return `${sol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} SOL`
}

/** Format a payment window in seconds as a human-readable string, e.g. "24h" or "30m". */
export function formatPaymentWindow(seconds: number): string {
  const h = seconds / 3600
  if (h < 1) return `${Math.round(seconds / 60)}m`
  if (h === Math.floor(h)) return `${h}h`
  return `${h.toFixed(1)}h`
}

/**
 * Which locale to format in, and whether the code is one we know (#92).
 *
 * The three formatters below take a `string`, not a `SupportedCurrency`,
 * because that is what their callers actually hold. `fiat_currency` is
 * `varchar(3)` in the database with no CHECK constraint and is typed `string`
 * all the way out to the wire. Sixteen call sites across web and mobile used to
 * assert it back to `SupportedCurrency`; #95 deleted every one, and the
 * compiler accepted their absence with no other edit, which is the evidence
 * that they bought nothing once these three widened. Three casts remain, all on
 * the server and none of them a read these formatters serve: the two route
 * guards that validate an incoming currency, and one rate-map lookup that
 * checks for `undefined` on the next line. Before this the formatters threw a
 * TypeError on anything unlisted — destructuring `locale` off `undefined` —
 * which is a blank screen where a price should be.
 *
 * No NEW row can carry a bad one: exactly two routes accept a fiat_currency
 * from a request body — exchange offer creation and fiat quote creation — and
 * both reject anything unlisted, with a 400 and a 422. Every other server write
 * propagates a value from those. What that does NOT cover is a row written
 * before those guards existed, and it lives two services away from the casts
 * that read it, so a third write path would not know about it. Hence the belt.
 */
function displayLocale(currency: string): { locale: string; known: boolean } {
  return isSupportedCurrency(currency)
    ? { locale: CURRENCY_META[currency].locale, known: true }
    : { locale: CURRENCY_META[DEFAULT_CURRENCY].locale, known: false }
}

/** Format a fiat amount in the given currency, e.g. formatFiat(85000, 'NGN') → "₦85,000" */
export function formatFiat(amount: number, currency: string): string {
  const { locale, known } = displayLocale(currency)
  // An unknown code still shows the reader the amount and what it is denominated
  // in, which beats both a crash and a number with no unit on it.
  if (!known) return `${currency} ${amount.toLocaleString(locale, { maximumFractionDigits: 0 })}`.trim()
  return amount.toLocaleString(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
}

/**
 * An exchange RATE, which is not an amount and must not be rounded like one.
 *
 * `formatFiat` drops to whole units — right for "₦75,000 total", wrong for the
 * figure an order book exists to compare: two GHS offers at 15.40 and 15.49
 * both rendered "GH₵15", so the column the copy tells readers to scan down
 * could not be scanned. Two decimals is the market granularity; a whole rate
 * stays whole, because most NGN rates are and "₦1,500.00" is noise.
 */
export function formatRate(rate: number, currency: string): string {
  return formatFiatPrecise(rate, currency)
}

/**
 * A fiat amount that must keep its minor units — a conversion fee, a payout
 * total — as opposed to `formatFiat`, which drops to whole units because that
 * is right for a headline total.
 *
 * `fiat_amount` and `fee_amount` are both `numeric(20, 4)` in the database, so
 * the minor units are real and roundable-away: a GH₵15.40 fee shown as "GH₵15"
 * understates what the seller is being charged. Whole values still render
 * whole, so "₦16,000" does not become "₦16,000.00".
 *
 * Shares its implementation with `formatRate` because a rate and a precise
 * amount want exactly the same treatment; the two names exist so neither call
 * site has to describe a fee as a rate.
 */
export function formatFiatPrecise(amount: number, currency: string): string {
  const { locale, known } = displayLocale(currency)
  const digits = Number.isInteger(amount) ? 0 : 2
  if (!known) {
    return `${currency} ${amount.toLocaleString(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}`.trim()
  }
  return amount.toLocaleString(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/**
 * Compact currency display used in card densities, e.g. "₦240k", "$1.5M".
 * Falls back to full formatFiat() for amounts < 1,000.
 */
export function formatFiatShort(amount: number, currency: string): string {
  const { locale, known } = displayLocale(currency)
  // An unknown code has no symbol to extract, so it prefixes itself instead.
  const symbol = known
    ? (0).toLocaleString(locale, { style: 'currency', currency, maximumFractionDigits: 0 })
        .replace(/[\d.,\s]/g, '')
    : currency === '' ? '' : `${currency} `
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000)     return `${symbol}${Math.round(amount / 1_000)}k`
  return formatFiat(amount, currency)
}
