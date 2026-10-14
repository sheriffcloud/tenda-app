export const SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'KES', 'ZAR', 'PHP', 'AED', 'USD', 'GBP', 'EUR'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export const CURRENCY_META: Record<
  SupportedCurrency,
  { symbol: string; name: string; flag: string; locale: string; coingeckoKey: string }
> = {
  NGN: { symbol: '₦',   name: 'Nigerian Naira',    flag: '🇳🇬', locale: 'en-NG', coingeckoKey: 'ngn' },
  GHS: { symbol: '₵',   name: 'Ghanaian Cedi',      flag: '🇬🇭', locale: 'en-GH', coingeckoKey: 'ghs' },
  KES: { symbol: 'KSh', name: 'Kenyan Shilling',    flag: '🇰🇪', locale: 'en-KE', coingeckoKey: 'kes' },
  ZAR: { symbol: 'R',   name: 'South African Rand', flag: '🇿🇦', locale: 'en-ZA', coingeckoKey: 'zar' },
  PHP: { symbol: '₱',   name: 'Philippine Peso',    flag: '🇵🇭', locale: 'en-PH', coingeckoKey: 'php' },
  AED: { symbol: 'AED', name: 'UAE Dirham',         flag: '🇦🇪', locale: 'en-AE', coingeckoKey: 'aed' },
  USD: { symbol: '$',   name: 'US Dollar',          flag: '🇺🇸', locale: 'en-US', coingeckoKey: 'usd' },
  GBP: { symbol: '£',   name: 'British Pound',      flag: '🇬🇧', locale: 'en-GB', coingeckoKey: 'gbp' },
  EUR: { symbol: '€',   name: 'Euro',               flag: '🇪🇺', locale: 'de-DE', coingeckoKey: 'eur' },
}

/**
 * What a client falls back to when it has no currency, or when the one it has
 * cannot be trusted (#88).
 *
 * Named here rather than spelled in each store: mobile's settings store had
 * 'NGN' written twice, and a default that lives in two places is one somebody
 * changes in one of them.
 */
export const DEFAULT_CURRENCY: SupportedCurrency = 'NGN'

/**
 * Whether a value is a currency this product supports.
 *
 * Takes `unknown` because the callers are BOUNDARIES — parsed JSON out of
 * device storage, a query string, a payload — where a type assertion asserts
 * rather than checks. `CURRENCY_META` is a total Record over this union, so an
 * unlisted string indexes to `undefined` and the next property read throws.
 * EIGHTEEN reads across eleven files do that without a fallback — three here in
 * currency-display, nine in mobile, four in web, two on the server, none in
 * admin — counted by making the Record `Partial` and reading the compiler's
 * list. Guarding eighteen call sites is not the answer; guarding the vocabulary
 * where untrusted values enter is.
 */
export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
}
