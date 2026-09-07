import type { PayoutCountrySpec } from './types'
import { requireNonEmpty, requireDigits, maskTail } from './helpers'

/**
 * Kenya — bank transfer (KES). Account numbers vary by bank (typically 6–20
 * digits); the bank is captured by name rather than a churny code list.
 */
export const KE_PAYOUT: PayoutCountrySpec = {
  country: 'KE',
  countryName: 'Kenya',
  flag: '🇰🇪',
  currency: 'KES',
  rails: [
    {
      kind: 'bank',
      label: 'Bank account',
      fields: [
        { column: 'bank_code', label: 'Bank name', placeholder: 'Equity Bank', keyboard: 'default', autoCapitalize: 'characters' },
        { column: 'account_number', label: 'Account number', placeholder: '0123456789', keyboard: 'numeric', maxLength: 20 },
        { column: 'account_name', label: 'Account name', placeholder: 'WANJIKU KAMAU', keyboard: 'default', autoCapitalize: 'characters' },
      ],
      validate: (i) =>
        requireNonEmpty(i.bank_code, 'Bank name') ??
        requireNonEmpty(i.account_name, 'Account name') ??
        requireDigits(i.account_number, 'Account number', { min: 6, max: 20 }),
      maskAccountNumber: (n) => maskTail(n, 4),
    },
  ],
}
