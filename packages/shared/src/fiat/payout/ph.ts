import type { PayoutCountrySpec, PayoutFieldOption } from './types'
import { requireNonEmpty, requireDigits, requireOption, maskTail } from './helpers'

/**
 * Philippine e-wallets (bank_code values for the mobile-money rail).
 *
 * These are the destinations, not integrations: Tenda stores which wallet the
 * seller wants paying into and the buyer sends it themselves, exactly as with
 * Ghana's MoMo networks.
 */
export const PH_WALLET_NETWORKS: PayoutFieldOption[] = [
  { value: 'GCASH', label: 'GCash' },
  { value: 'MAYA', label: 'Maya' },
  { value: 'GRABPAY', label: 'GrabPay' },
]

/**
 * Philippine mobile number: 11 local digits beginning `09` (e.g. 0917XXXXXXX).
 * E-wallet accounts here are keyed by that number, so it doubles as the
 * account identifier.
 */
function validatePhMsisdn(value: string): string | null {
  const digits = requireDigits(value, 'Mobile number', { exact: 11 })
  if (digits !== null) return digits
  return value.trim().startsWith('09') ? null : 'Mobile number must start with 09'
}

/**
 * Philippines — bank transfer AND e-wallet (PHP).
 *
 * The wallet rail is first-class here for the same reason it is in Ghana: a
 * large share of the population is reachable by an e-wallet and not by a bank
 * account, and a payout market that only offers bank transfer excludes them.
 *
 * Bank account numbers are 10–16 digits and vary by institution (BPI is 10,
 * BDO 10–12, Metrobank 13), so the range stays wide rather than guessing at a
 * bank the seller did not tell us about.
 */
export const PH_PAYOUT: PayoutCountrySpec = {
  country: 'PH',
  countryName: 'Philippines',
  flag: '🇵🇭',
  currency: 'PHP',
  rails: [
    {
      kind: 'bank',
      label: 'Bank account',
      fields: [
        { column: 'bank_code', label: 'Bank name', placeholder: 'BPI', keyboard: 'default', autoCapitalize: 'characters' },
        { column: 'account_number', label: 'Account number', placeholder: '1234567890', keyboard: 'numeric', maxLength: 16 },
        { column: 'account_name', label: 'Account name', placeholder: 'MARIA SANTOS', keyboard: 'default', autoCapitalize: 'characters' },
      ],
      validate: (i) =>
        requireNonEmpty(i.bank_code, 'Bank name') ??
        requireNonEmpty(i.account_name, 'Account name') ??
        requireDigits(i.account_number, 'Account number', { min: 10, max: 16 }),
      maskAccountNumber: (n) => maskTail(n, 4),
    },
    {
      kind: 'mobile_money',
      label: 'E-wallet',
      fields: [
        { column: 'bank_code', label: 'Wallet', placeholder: 'Select wallet', keyboard: 'default', options: PH_WALLET_NETWORKS },
        { column: 'account_number', label: 'Mobile number', placeholder: '09XXXXXXXXX', keyboard: 'numeric', maxLength: 11 },
        { column: 'account_name', label: 'Registered name', placeholder: 'MARIA SANTOS', keyboard: 'default', autoCapitalize: 'characters' },
      ],
      validate: (i) =>
        requireOption(i.bank_code, PH_WALLET_NETWORKS, 'Wallet') ??
        requireNonEmpty(i.account_name, 'Registered name') ??
        validatePhMsisdn(i.account_number),
      // THREE, not four — the same call Ghana's MoMo rail makes, for the same
      // reason: a mobile number carries a low-entropy network prefix (09XX
      // here, 024 there), so most of its identifying value sits in the tail.
      // Four of eleven leaves three unknown digits; three leaves four, which is
      // the disclosure a bank account number of twice the length can afford and
      // an MSISDN cannot.
      maskAccountNumber: (n) => maskTail(n, 3),
    },
  ],
}
