/**
 * Supported fiat currencies. Mirrors @tenda/shared/constants/currencies. Kept inline
 * here so the marketing site has no workspace-package dependency.
 */

export const SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'KES', 'ZAR', 'PHP', 'USD', 'GBP', 'EUR'] as const

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]

export interface CurrencyMeta {
  code: CurrencyCode
  symbol: string
  name: string
  flag: string
  locale: string
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  NGN: { code: 'NGN', symbol: '₦',   name: 'Nigerian Naira',     flag: '🇳🇬', locale: 'en-NG' },
  GHS: { code: 'GHS', symbol: '₵',   name: 'Ghanaian Cedi',      flag: '🇬🇭', locale: 'en-GH' },
  KES: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling',    flag: '🇰🇪', locale: 'en-KE' },
  ZAR: { code: 'ZAR', symbol: 'R',   name: 'South African Rand', flag: '🇿🇦', locale: 'en-ZA' },
  PHP: { code: 'PHP', symbol: '₱',   name: 'Philippine Peso',    flag: '🇵🇭', locale: 'en-PH' },
  USD: { code: 'USD', symbol: '$',   name: 'US Dollar',          flag: '🇺🇸', locale: 'en-US' },
  GBP: { code: 'GBP', symbol: '£',   name: 'British Pound',      flag: '🇬🇧', locale: 'en-GB' },
  EUR: { code: 'EUR', symbol: '€',   name: 'Euro',               flag: '🇪🇺', locale: 'de-DE' },
}

export const CURRENCY_LIST: CurrencyMeta[] = SUPPORTED_CURRENCIES.map((c) => CURRENCIES[c])
