import type { PayoutCountrySpec } from './types'
import { requireNonEmpty, requireIban, canonicalIban, maskTail } from './helpers'

/** UAE IBANs are exactly 23 characters: AE + 2 check digits + 3 bank + 16 account. */
const AE_IBAN_LENGTH = 23

/**
 * United Arab Emirates — bank transfer by IBAN (AED). No wallet rail: domestic
 * transfers here run over IBAN through the banks, and the money-transfer
 * businesses expats actually use are cash-over-counter, not an account we
 * could store and a buyer could pay into unattended.
 *
 * The IBAN carries the bank inside it, so unlike the other markets the account
 * number IS the routing information. The bank name is still collected because
 * the payer sees it before sending — a name they recognise is the difference
 * between confidence and an abandoned trade — but nothing is derived from it.
 *
 * Validation runs the real ISO 13616 mod-97 checksum, not just a length check.
 * This is the one field in the registry where a typo does not bounce: a wrong
 * IBAN either fails at the bank days later or, if the check digits happen to
 * fit, credits a different account with no way back.
 */
export const AE_PAYOUT: PayoutCountrySpec = {
  country: 'AE',
  countryName: 'United Arab Emirates',
  flag: '🇦🇪',
  currency: 'AED',
  rails: [
    {
      kind: 'bank',
      label: 'Bank account',
      fields: [
        { column: 'bank_code', label: 'Bank name', placeholder: 'Emirates NBD', keyboard: 'default', autoCapitalize: 'characters' },
        { column: 'account_number', label: 'IBAN', placeholder: 'AE07 0331 2345 6789 0123 456', keyboard: 'default', autoCapitalize: 'characters', maxLength: 29 },
        { column: 'account_name', label: 'Account name', placeholder: 'AHMED AL MANSOURI', keyboard: 'default', autoCapitalize: 'characters' },
      ],
      // Accepting the grouped form means the typed value and the account are
      // different strings; this is the one that gets stored and compared.
      normalizeAccountNumber: canonicalIban,
      validate: (i) =>
        requireNonEmpty(i.bank_code, 'Bank name') ??
        requireNonEmpty(i.account_name, 'Account name') ??
        requireIban(i.account_number, 'IBAN', { country: 'AE', length: AE_IBAN_LENGTH }),
      // Four digits of a 23-character IBAN identify the account to its owner
      // without exposing the bank code sitting in the middle of it.
      maskAccountNumber: (n) => maskTail(n, 4),
    },
  ],
}
