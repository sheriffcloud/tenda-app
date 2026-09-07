import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAYOUT_COUNTRY_SPECS,
  getPayoutRail,
  type PayoutRailSpec,
} from '../../src/fiat/payout'

/**
 * The canonical-account-number contract. A rail that accepts more than one
 * spelling of the same account has to say which spelling IS the account: the
 * server stores that one, uniqueness compares that one, and the mask reads it.
 *
 * These are registry-wide invariants rather than one country's field rules,
 * which is why they live apart from payout-specs.ts.
 */

const aeBank = getPayoutRail('AE', 'bank')!

/** A published UAE example IBAN — 23 chars, and mod-97 valid. */
const AE_IBAN = 'AE070331234567890123456'

/**
 * NORMALISATION IS PART OF THE CONTRACT, not a convenience.
 *
 * `requireIban` accepts the grouped form people paste, so for AE the value the
 * user types and the value that identifies the account are different strings.
 * Whatever gets stored has to be the second one: masking ran on the raw input
 * and revealed "  456" instead of "3456", and the uniqueness constraint on
 * (user_id, kind, bank_code, account_number) saw the spaced and unspaced forms
 * as two different accounts, so the same IBAN could be saved twice.
 */
test('AE bank: declares a canonical account number, and it is the unspaced IBAN', () => {
  assert.ok(aeBank.normalizeAccountNumber, 'AE must declare a canonical form')
  for (const typed of ['AE07 0331 2345 6789 0123 456', 'ae070331234567890123456', '  AE07 0331 2345 6789 0123 456  ']) {
    assert.equal(aeBank.normalizeAccountNumber(typed), AE_IBAN, `${typed} did not canonicalise`)
  }
})

test('AE bank: canonicalising is idempotent, so re-saving cannot fork the value', () => {
  const once = aeBank.normalizeAccountNumber!(AE_IBAN)
  assert.equal(aeBank.normalizeAccountNumber!(once), once)
})

test('AE bank: the canonical form is what masks to the last four digits', () => {
  const typed = 'AE07 0331 2345 6789 0123 456'
  const stored = aeBank.normalizeAccountNumber!(typed)
  assert.equal(aeBank.maskAccountNumber(stored), `${'•'.repeat(19)} 3456`)
  // And the raw input is exactly what it must NOT be stored as.
  assert.notEqual(aeBank.maskAccountNumber(typed), aeBank.maskAccountNumber(stored))
})

/** Every rail in the registry, paired with the country it belongs to. */
function allRails(): { country: string; rail: PayoutRailSpec }[] {
  return Object.values(PAYOUT_COUNTRY_SPECS).flatMap((spec) =>
    spec.rails.map((rail) => ({ country: spec.country, rail })),
  )
}

/**
 * A canonical form is only for rails that accept more than one spelling of the
 * same account. All-digit rails do not: their validators reject anything but
 * digits, so a normaliser there would be reshaping a value already destined for
 * rejection — motion that hides input rather than checking it.
 *
 * Derived from the registry rather than listing today's seven digit rails, so
 * a market added tomorrow is covered without anyone remembering to add it.
 */
test('only rails that accept several spellings declare a canonical form', () => {
  const withNormaliser = allRails()
    .filter(({ rail }) => rail.normalizeAccountNumber !== undefined)
    .map(({ country, rail }) => `${country}/${rail.kind}`)
  assert.deepEqual(withNormaliser, ['AE/bank'], 'a rail gained or lost a canonical form')
})

/**
 * The invariant that ties the two together: a canonical form must produce
 * something its OWN validator still accepts. One that did not would be worse
 * than none at all — it would turn a valid account into a rejected one at the
 * moment of saving.
 *
 * Driven off each rail's own placeholder, which is the example the spec offers
 * the user, so this covers every normalising rail rather than the one whose
 * sample someone remembered to write down. A rail that declares a canonical
 * form therefore owes a placeholder that is a real value — which is a fair
 * price, since the placeholder is what the user is being told to imitate.
 */
test('every canonical form still passes its own validator', () => {
  const normalising = allRails().filter(({ rail }) => rail.normalizeAccountNumber !== undefined)
  assert.ok(normalising.length > 0, 'no rail declares a canonical form — has the hook been dropped?')

  for (const { country, rail } of normalising) {
    const field = rail.fields.find((f) => f.column === 'account_number')
    assert.ok(field?.placeholder, `${country}/${rail.kind} has no account-number placeholder`)

    const canonical = rail.normalizeAccountNumber!(field.placeholder)

    assert.equal(
      // Spelled out rather than built from the field list: PayoutAccountInput
      // has exactly these three columns, so constructing it generically would
      // need a cast to say what the type already says.
      rail.validate({ bank_code: 'A BANK', account_number: canonical, account_name: 'A NAME' }),
      null,
      `${country}/${rail.kind} rejects the canonical form of its own placeholder`,
    )
    // And it must be stable: saving twice cannot fork the stored value.
    assert.equal(rail.normalizeAccountNumber!(canonical), canonical)
  }
})
