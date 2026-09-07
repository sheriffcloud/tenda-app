import type { PayoutCountrySpec } from './types'
import { requireNonEmpty, requireDigits, maskTail } from './helpers'

/** Nigeria — NUBAN bank transfer (NGN). Mobile-money isn't a payout rail here. */
export const NG_PAYOUT: PayoutCountrySpec = {
  country: 'NG',
  countryName: 'Nigeria',
  flag: '🇳🇬',
  currency: 'NGN',
  rails: [
    {
      kind: 'bank',
      label: 'Bank account',
      fields: [
        { column: 'bank_code', label: 'Bank (NIP) code', placeholder: '058', keyboard: 'numeric', maxLength: 6 },
        { column: 'account_number', label: 'Account number', placeholder: '0123456789', keyboard: 'numeric', maxLength: 10 },
        { column: 'account_name', label: 'Account name', placeholder: 'ADAEZE OKOYE', keyboard: 'default', autoCapitalize: 'characters' },
      ],
      validate: (i) =>
        requireNonEmpty(i.account_name, 'Account name') ??
        requireDigits(i.bank_code, 'Bank (NIP) code', { min: 3, max: 6 }) ??
        requireDigits(i.account_number, 'Account number', { exact: 10 }),
      maskAccountNumber: (n) => maskTail(n, 4),
    },
  ],
}
