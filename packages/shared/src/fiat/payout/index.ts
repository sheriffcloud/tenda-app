import type { SupportedCurrency } from '../../constants/currencies'
import type { PayoutCountrySpec, PayoutRailKind, PayoutRailSpec } from './types'
import { NG_PAYOUT } from './ng'
import { KE_PAYOUT } from './ke'
import { GH_PAYOUT } from './gh'

export * from './types'
export { GH_MOMO_NETWORKS } from './gh'

/** The launch payout countries, keyed by ISO 3166-1 alpha-2. */
export const PAYOUT_COUNTRY_SPECS: Readonly<Record<string, PayoutCountrySpec>> = {
  NG: NG_PAYOUT,
  KE: KE_PAYOUT,
  GH: GH_PAYOUT,
}

/** Supported payout country codes (['NG','KE','GH']). */
export const SUPPORTED_PAYOUT_COUNTRIES: string[] = Object.keys(PAYOUT_COUNTRY_SPECS)

/**
 * The fiat currencies payouts settle in — DERIVED from the country specs so it
 * can never drift from the countries we actually support. Drives both the p2p
 * exchange's enabled currencies and the offramp currency validation.
 */
export const PAYOUT_CURRENCIES: SupportedCurrency[] = [
  ...new Set(Object.values(PAYOUT_COUNTRY_SPECS).map((s) => s.currency)),
]

/**
 * Fallback settlement currency when a user's country isn't a payout market
 * (the launch anchor). Asserted to be one of PAYOUT_CURRENCIES by the tests.
 */
export const DEFAULT_PAYOUT_CURRENCY: SupportedCurrency = 'NGN'

/** Country spec, or null when the country isn't a supported payout market. */
export function getPayoutSpec(country: string): PayoutCountrySpec | null {
  return PAYOUT_COUNTRY_SPECS[country] ?? null
}

/**
 * The single fiat currency payouts settle in for a country, or the launch
 * default when the country has no spec. One source for every surface that
 * needs "which currency does this seller quote in" (Sell/cash-out + P2P post).
 */
export function payoutCurrencyForCountry(country: string | null): SupportedCurrency {
  return (country !== null ? getPayoutSpec(country)?.currency : undefined) ?? DEFAULT_PAYOUT_CURRENCY
}

/** A specific rail (bank / mobile_money) for a country, or null if unsupported. */
export function getPayoutRail(country: string, kind: PayoutRailKind): PayoutRailSpec | null {
  return getPayoutSpec(country)?.rails.find((r) => r.kind === kind) ?? null
}
