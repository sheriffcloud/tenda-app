import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GH_MOMO_NETWORKS,
  PH_WALLET_NETWORKS,
  getPayoutRail,
} from '../../src/fiat/payout'

/**
 * Per-market rail rules: the field validation each country's spec enforces,
 * which the mobile form and the server's bank-accounts route BOTH run.
 *
 * Split out of payout.test.ts — which keeps the cross-cutting registry shape,
 * currency resolution and masking invariants — when adding ZA and PH pushed
 * one file past 300 lines. The seam is deliberate: those tests are about the
 * registry as a whole, these are about one country at a time, so adding a
 * market only ever appends a section here.
 */

// ---------- NG (NUBAN bank) -------------------------------------------------

const ngBank = getPayoutRail('NG', 'bank')!

test('NG bank: a valid NUBAN account passes', () => {
  assert.equal(ngBank.validate({ bank_code: '058', account_number: '0123456789', account_name: 'ADAEZE OKOYE' }), null)
})

test('NG bank: rejects a non-10-digit account, blank name, non-numeric code', () => {
  assert.match(ngBank.validate({ bank_code: '058', account_number: '012345678', account_name: 'A' }) ?? '', /Account number/)
  assert.match(ngBank.validate({ bank_code: '058', account_number: '0123456789', account_name: '  ' }) ?? '', /Account name/)
  assert.match(ngBank.validate({ bank_code: 'GTB', account_number: '0123456789', account_name: 'A' }) ?? '', /Bank \(NIP\) code/)
})

test('NG bank: masks all but the last 4 digits', () => {
  assert.equal(ngBank.maskAccountNumber('0123456789'), '•••••• 6789')
})

// ---------- KE (bank) -------------------------------------------------------

const keBank = getPayoutRail('KE', 'bank')!

test('KE bank: valid passes; too-short account rejected', () => {
  assert.equal(keBank.validate({ bank_code: 'Equity Bank', account_number: '01234567', account_name: 'WANJIKU' }), null)
  assert.match(keBank.validate({ bank_code: 'Equity', account_number: '123', account_name: 'W' }) ?? '', /Account number/)
  assert.match(keBank.validate({ bank_code: '', account_number: '01234567', account_name: 'W' }) ?? '', /Bank name/)
})

// ---------- GH (bank + MoMo) ------------------------------------------------

const ghBank = getPayoutRail('GH', 'bank')!
const ghMomo = getPayoutRail('GH', 'mobile_money')!

test('GH bank: valid passes; out-of-range account rejected', () => {
  assert.equal(ghBank.validate({ bank_code: 'GCB Bank', account_number: '12345678901', account_name: 'KWAME' }), null)
  assert.match(ghBank.validate({ bank_code: 'GCB', account_number: '123', account_name: 'K' }) ?? '', /Account number/)
})

test('GH MoMo: valid MTN number passes', () => {
  assert.equal(ghMomo.validate({ bank_code: 'MTN', account_number: '0241234567', account_name: 'KWAME MENSAH' }), null)
})

test('GH MoMo: rejects unknown network, non-10-digit and non-leading-0 numbers', () => {
  assert.match(ghMomo.validate({ bank_code: 'PAYPAL', account_number: '0241234567', account_name: 'K' }) ?? '', /Network/)
  assert.match(ghMomo.validate({ bank_code: 'MTN', account_number: '24123456', account_name: 'K' }) ?? '', /Mobile number/)
  assert.match(ghMomo.validate({ bank_code: 'MTN', account_number: '1241234567', account_name: 'K' }) ?? '', /start with 0/)
  assert.match(ghMomo.validate({ bank_code: 'MTN', account_number: '024123456X', account_name: 'K' }) ?? '', /digits only/)
})

test('GH MoMo: networks are the three live GH providers; number masks to last 3', () => {
  assert.deepEqual(GH_MOMO_NETWORKS.map((n) => n.value), ['MTN', 'TELECEL', 'AIRTELTIGO'])
  assert.equal(ghMomo.maskAccountNumber('0241234567'), '••••••• 567')
})

// ---------- ZA (bank) -------------------------------------------------------

const zaBank = getPayoutRail('ZA', 'bank')!

test('ZA bank: a valid EFT account passes', () => {
  assert.equal(
    zaBank.validate({ bank_code: 'Capitec Bank', account_number: '1234567890', account_name: 'THANDI NKOSI' }),
    null,
  )
})

/**
 * 6–13 digits on purpose: South African account numbers genuinely vary by bank
 * (Capitec 10, FNB 11, older Standard Bank 9). A tighter rule would reject real
 * accounts, and that is the more expensive failure — a rejected seller cannot
 * trade at all, while a mistyped number is caught by the buyer before they send.
 */
test('ZA bank: accepts the full length range banks actually issue', () => {
  for (const n of ['123456', '123456789', '1234567890', '1234567890123']) {
    assert.equal(
      zaBank.validate({ bank_code: 'FNB', account_number: n, account_name: 'T NKOSI' }),
      null,
      `${n} (${n.length} digits) should be accepted`,
    )
  }
})

test('ZA bank: rejects out-of-range, non-numeric and blank fields', () => {
  const ok = { bank_code: 'FNB', account_number: '1234567890', account_name: 'T NKOSI' }
  assert.match(zaBank.validate({ ...ok, account_number: '12345' }) ?? '', /Account number/)
  assert.match(zaBank.validate({ ...ok, account_number: '12345678901234' }) ?? '', /Account number/)
  assert.match(zaBank.validate({ ...ok, account_number: '123456789O' }) ?? '', /digits only/)
  assert.match(zaBank.validate({ ...ok, bank_code: '   ' }) ?? '', /Bank name/)
  assert.match(zaBank.validate({ ...ok, account_name: '' }) ?? '', /Account name/)
})

// ---------- PH (bank + e-wallet) --------------------------------------------

const phBank = getPayoutRail('PH', 'bank')!
const phWallet = getPayoutRail('PH', 'mobile_money')!

test('PH bank: a valid account passes; short and long are rejected', () => {
  const ok = { bank_code: 'BPI', account_number: '1234567890', account_name: 'MARIA SANTOS' }
  assert.equal(phBank.validate(ok), null)
  assert.match(phBank.validate({ ...ok, account_number: '123456789' }) ?? '', /Account number/)
  assert.match(phBank.validate({ ...ok, account_number: '12345678901234567' }) ?? '', /Account number/)
})

/**
 * Read the options off the FIELD, not off the exported constant. Iterating the
 * same array the validator checks against is a tautology — it passes however
 * the list is edited. Going through the field spec is what would catch the
 * real drift: a picker whose options were inlined separately from the list the
 * validator accepts, so the form offers a wallet the server then rejects.
 */
test('PH e-wallet: every wallet the FIELD offers is accepted by the validator', () => {
  const walletField = phWallet.fields.find((f) => f.column === 'bank_code')
  assert.ok(walletField?.options, 'the wallet field must render as a picker')
  assert.ok(walletField.options.length > 0)
  for (const option of walletField.options) {
    assert.equal(
      phWallet.validate({ bank_code: option.value, account_number: '09171234567', account_name: 'M SANTOS' }),
      null,
      `${option.label} is offered by the picker but rejected by the validator`,
    )
  }
  // And the picker is the exported list, so mobile and the server agree.
  assert.deepEqual(walletField.options, PH_WALLET_NETWORKS)
})

test('PH e-wallet: rejects a wallet nobody offers', () => {
  assert.match(
    phWallet.validate({ bank_code: 'PAYPAL', account_number: '09171234567', account_name: 'M SANTOS' }) ?? '',
    /Wallet/,
  )
})

/**
 * Three digits, matching Ghana's MoMo rail rather than the bank convention.
 * The registry treats tail length as a per-rail disclosure decision, and a
 * mobile number is the case where four is too many — its leading digits are a
 * network prefix, so the tail is most of what identifies the person.
 */
test('PH e-wallet: masks a mobile number to three digits, as GH MoMo does', () => {
  assert.equal(phWallet.maskAccountNumber('09171234567'), `${'\u2022'.repeat(8)} 567`)
  const ghMomo = getPayoutRail('GH', 'mobile_money')!
  const tail = (rail: typeof phWallet, n: string) => rail.maskAccountNumber(n).split(' ')[1].length
  assert.equal(tail(phWallet, '09171234567'), tail(ghMomo, '0241234567'), 'mobile rails must agree')
})

/**
 * PH mobile numbers are 11 digits beginning 09. The length and prefix errors
 * are separate messages on purpose: a 10-digit number is a typo, while one
 * starting 63 is the international form, and "must start with 09" is the
 * message that actually gets that user unstuck.
 */
test('PH e-wallet: rejects wrong length, the international form, and non-digits', () => {
  const ok = { bank_code: 'GCASH', account_number: '09171234567', account_name: 'M SANTOS' }
  assert.equal(phWallet.validate(ok), null)
  assert.match(phWallet.validate({ ...ok, account_number: '0917123456' }) ?? '', /11 digits/)
  assert.match(phWallet.validate({ ...ok, account_number: '63917123456' }) ?? '', /start with 09/)
  assert.match(phWallet.validate({ ...ok, account_number: '0917123456X' }) ?? '', /digits only/)
})

// ---------- AE (IBAN bank) --------------------------------------------------

const aeBank = getPayoutRail('AE', 'bank')!

/** A published UAE example IBAN — 23 chars, and mod-97 valid. */
const AE_IBAN = 'AE070331234567890123456'
const aeOk = { bank_code: 'Emirates NBD', account_number: AE_IBAN, account_name: 'AHMED AL MANSOURI' }

test('AE bank: a valid IBAN passes', () => {
  assert.equal(aeBank.validate(aeOk), null)
})

/**
 * People paste IBANs in the grouped form their bank prints, and often in lower
 * case. Rejecting either would be rejecting a correct account over whitespace,
 * so both are normalised before the checksum runs.
 */
test('AE bank: accepts the grouped and lower-case forms banks actually print', () => {
  assert.equal(aeBank.validate({ ...aeOk, account_number: 'AE07 0331 2345 6789 0123 456' }), null)
  assert.equal(aeBank.validate({ ...aeOk, account_number: 'ae07 0331 2345 6789 0123 456' }), null)
})

/**
 * THE REASON THE CHECKSUM IS HERE. An IBAN is the one field in the registry
 * where a typo does not bounce — it fails at the bank days later, or credits a
 * different account. A length check alone accepts both of these; mod-97 was
 * designed to catch exactly them.
 */
test('AE bank: rejects a transposition and a single wrong digit', () => {
  assert.match(aeBank.validate({ ...aeOk, account_number: 'AE070331234567890123465' }) ?? '', /IBAN is not valid/)
  assert.match(aeBank.validate({ ...aeOk, account_number: 'AE070331234567890123457' }) ?? '', /IBAN is not valid/)
})

test('AE bank: rejects another country IBAN, and the wrong length', () => {
  assert.match(aeBank.validate({ ...aeOk, account_number: 'GB070331234567890123456' }) ?? '', /start with AE/)
  assert.match(aeBank.validate({ ...aeOk, account_number: 'AE07033123456789012345' }) ?? '', /23 characters/)
})

test('AE bank: rejects blank fields, naming the one that is missing', () => {
  assert.match(aeBank.validate({ ...aeOk, account_number: '' }) ?? '', /IBAN is required/)
  assert.match(aeBank.validate({ ...aeOk, bank_code: '   ' }) ?? '', /Bank name/)
  assert.match(aeBank.validate({ ...aeOk, account_name: '' }) ?? '', /Account name/)
})

test('AE bank: masks all but the last 4 of the IBAN', () => {
  assert.equal(aeBank.maskAccountNumber(AE_IBAN), `${'•'.repeat(19)} 3456`)
})
