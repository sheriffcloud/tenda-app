import type { PayoutCountrySpec } from './types'
import { requireNonEmpty, requireDigits, maskTail } from './helpers'

/**
 * South Africa — bank transfer (ZAR). No mobile-money rail: SA settles
 * consumer-to-consumer over EFT, and the wallet products that exist here
 * (e.g. bank-run instant payments) are reached through the same bank details
 * rather than through a separate MSISDN rail.
 *
 * The bank is captured by NAME, not by branch code — the same call Kenya
 * makes. South Africa does have stable six-digit universal branch codes, but
 * the person actually sending the money picks their recipient's bank from a
 * list in their banking app and the code is filled in for them, so asking a
 * seller to look one up adds a step and a way to be wrong for no gain.
 *
 * Account numbers are 6–13 digits depending on the bank (Capitec's are 10,
 * FNB's 11, older Standard Bank ones 9), so the range is deliberately wide;
 * a tighter rule would reject real accounts.
 */
export const ZA_PAYOUT: PayoutCountrySpec = {
  country: 'ZA',
  countryName: 'South Africa',
  flag: '🇿🇦',
  currency: 'ZAR',
  rails: [
    {
      kind: 'bank',
      label: 'Bank account',
      fields: [
        { column: 'bank_code', label: 'Bank name', placeholder: 'Capitec Bank', keyboard: 'default', autoCapitalize: 'characters' },
        { column: 'account_number', label: 'Account number', placeholder: '1234567890', keyboard: 'numeric', maxLength: 13 },
        { column: 'account_name', label: 'Account name', placeholder: 'THANDI NKOSI', keyboard: 'default', autoCapitalize: 'characters' },
      ],
      validate: (i) =>
        requireNonEmpty(i.bank_code, 'Bank name') ??
        requireNonEmpty(i.account_name, 'Account name') ??
        requireDigits(i.account_number, 'Account number', { min: 6, max: 13 }),
      maskAccountNumber: (n) => maskTail(n, 4),
    },
  ],
}
