import type { SupportedCurrency } from '../../constants/currencies'

/**
 * Payout-rail registry types. A single source, shared by the mobile payout
 * screen (field rendering + client validation) and the server bank-accounts
 * routes (authoritative validation), so options and rules can never diverge.
 * Adding a country = one spec file wired into the registry; adding a rail to a
 * country = one entry in that country's `rails`.
 */

/**
 * How money reaches the recipient. The runtime array is the SINGLE source —
 * the union type derives from it, the route validates against it, and a test
 * pins it to the `payout_rail_kind` DB enum. Persisted as `bank_accounts.kind`.
 */
export const PAYOUT_RAIL_KINDS = ['bank', 'mobile_money'] as const
export type PayoutRailKind = (typeof PAYOUT_RAIL_KINDS)[number]

/** Runtime membership check that narrows an unknown to a PayoutRailKind. */
export function isPayoutRailKind(value: unknown): value is PayoutRailKind {
  return typeof value === 'string' && (PAYOUT_RAIL_KINDS as readonly string[]).includes(value)
}

/** The three persisted columns a payout account always carries. */
export interface PayoutAccountInput {
  /** Bank/NIP code, or the mobile-money network id. */
  bank_code: string
  /** Account number (NUBAN, IBAN-less local no.) or the mobile-money MSISDN. */
  account_number: string
  /** Account/wallet holder name. */
  account_name: string
}

/** A selectable option for a field rendered as a picker (e.g. MoMo network). */
export interface PayoutFieldOption {
  value: string
  label: string
}

/**
 * One input field, describing BOTH how the mobile UI renders it and which
 * persisted column it fills. Rendered as a picker when `options` is present,
 * otherwise a text input.
 */
export interface PayoutFieldSpec {
  column: keyof PayoutAccountInput
  label: string
  placeholder: string
  keyboard: 'default' | 'numeric'
  autoCapitalize?: 'none' | 'characters'
  maxLength?: number
  options?: PayoutFieldOption[]
}

/** A payout rail (bank or mobile money) for one country. */
export interface PayoutRailSpec {
  kind: PayoutRailKind
  /** Short label for the rail selector ('Bank account', 'Mobile money'). */
  label: string
  fields: PayoutFieldSpec[]
  /** Validate a candidate account; returns a human message, or null if valid. */
  validate(input: PayoutAccountInput): string | null
  /** Masked account number for display ('•••• 6789'). */
  maskAccountNumber(accountNumber: string): string
}

/** Everything needed to collect and validate payouts for one country. */
export interface PayoutCountrySpec {
  /** ISO 3166-1 alpha-2, e.g. 'NG'. */
  country: string
  countryName: string
  flag: string
  /** The single fiat currency payouts settle in for this country. */
  currency: SupportedCurrency
  rails: PayoutRailSpec[]
}
