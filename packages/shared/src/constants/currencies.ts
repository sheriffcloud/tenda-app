export const SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'KES', 'ZAR', 'PHP', 'USD', 'GBP', 'EUR'] as const
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
  USD: { symbol: '$',   name: 'US Dollar',          flag: '🇺🇸', locale: 'en-US', coingeckoKey: 'usd' },
  GBP: { symbol: '£',   name: 'British Pound',      flag: '🇬🇧', locale: 'en-GB', coingeckoKey: 'gbp' },
  EUR: { symbol: '€',   name: 'Euro',               flag: '🇪🇺', locale: 'de-DE', coingeckoKey: 'eur' },
}
