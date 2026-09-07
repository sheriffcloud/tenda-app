import type { PayoutCountrySpec, PayoutFieldOption } from './types'
import { requireNonEmpty, requireDigits, requireOption, maskTail } from './helpers'

/** Ghana mobile-money networks (bank_code values for the MoMo rail). */
export const GH_MOMO_NETWORKS: PayoutFieldOption[] = [
  { value: 'MTN', label: 'MTN MoMo' },
  { value: 'TELECEL', label: 'Telecel Cash' },
  { value: 'AIRTELTIGO', label: 'AirtelTigo Money' },
]

/** Ghana MSISDN: 10 local digits with a leading 0 (e.g. 024XXXXXXX). */
function validateGhMsisdn(value: string): string | null {
  const digits = requireDigits(value, 'Mobile number', { exact: 10 })
  if (digits !== null) return digits
  return value.trim().startsWith('0') ? null : 'Mobile number must start with 0'
}

/** Ghana — bank transfer AND mobile money (GHS). MoMo is a first-class rail here. */
export const GH_PAYOUT: PayoutCountrySpec = {
  country: 'GH',
  countryName: 'Ghana',
  flag: '🇬🇭',
  currency: 'GHS',
  rails: [
    {
      kind: 'bank',
      label: 'Bank account',
      fields: [
        { column: 'bank_code', label: 'Bank name', placeholder: 'GCB Bank', keyboard: 'default', autoCapitalize: 'characters' },
        { column: 'account_number', label: 'Account number', placeholder: '1234567890123', keyboard: 'numeric', maxLength: 16 },
        { column: 'account_name', label: 'Account name', placeholder: 'KWAME MENSAH', keyboard: 'default', autoCapitalize: 'characters' },
      ],
      validate: (i) =>
        requireNonEmpty(i.bank_code, 'Bank name') ??
        requireNonEmpty(i.account_name, 'Account name') ??
        requireDigits(i.account_number, 'Account number', { min: 8, max: 16 }),
      maskAccountNumber: (n) => maskTail(n, 4),
    },
    {
      kind: 'mobile_money',
      label: 'Mobile money',
      fields: [
        { column: 'bank_code', label: 'Network', placeholder: 'Select network', keyboard: 'default', options: GH_MOMO_NETWORKS },
        { column: 'account_number', label: 'Mobile number', placeholder: '024XXXXXXX', keyboard: 'numeric', maxLength: 10 },
        { column: 'account_name', label: 'Registered name', placeholder: 'KWAME MENSAH', keyboard: 'default', autoCapitalize: 'characters' },
      ],
      validate: (i) =>
        requireOption(i.bank_code, GH_MOMO_NETWORKS, 'Network') ??
        requireNonEmpty(i.account_name, 'Registered name') ??
        validateGhMsisdn(i.account_number),
      maskAccountNumber: (n) => maskTail(n, 3),
    },
  ],
}
