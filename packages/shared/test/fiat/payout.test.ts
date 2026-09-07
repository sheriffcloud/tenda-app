import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAYOUT_COUNTRY_SPECS,
  SUPPORTED_PAYOUT_COUNTRIES,
  PAYOUT_CURRENCIES,
  PAYOUT_RAIL_KINDS,
  DEFAULT_PAYOUT_CURRENCY,
  GH_MOMO_NETWORKS,
  getPayoutSpec,
  getPayoutRail,
  isPayoutRailKind,
  payoutCurrencyForCountry,
} from '../../src/fiat/payout'
import { SUPPORTED_CURRENCIES } from '../../src/constants/currencies'
import { payoutRailKindEnum } from '../../src/db/schema/fiat'

// ---------- registry shape -------------------------------------------------

test('launch countries are exactly NG, KE, GH', () => {
  assert.deepEqual(new Set(SUPPORTED_PAYOUT_COUNTRIES), new Set(['NG', 'KE', 'GH']))
})

test('PAYOUT_CURRENCIES is derived, deduped, and a subset of SUPPORTED_CURRENCIES', () => {
  assert.deepEqual(new Set(PAYOUT_CURRENCIES), new Set(['NGN', 'KES', 'GHS']))
  for (const c of PAYOUT_CURRENCIES) {
    assert.ok(SUPPORTED_CURRENCIES.includes(c), `${c} must be a supported currency`)
  }
})

test('every spec is structurally sound (currency, ≥1 rail, fields map to columns)', () => {
  const columns = new Set(['bank_code', 'account_number', 'account_name'])
  for (const [code, spec] of Object.entries(PAYOUT_COUNTRY_SPECS)) {
    assert.equal(spec.country, code)
    assert.ok(spec.rails.length >= 1, `${code} needs a rail`)
    assert.ok(SUPPORTED_CURRENCIES.includes(spec.currency))
    for (const rail of spec.rails) {
      assert.ok(rail.fields.length > 0, `${code}/${rail.kind} needs fields`)
      for (const f of rail.fields) {
        assert.ok(columns.has(f.column), `${code}/${rail.kind} field column ${f.column}`)
      }
    }
  }
})

test('PAYOUT_RAIL_KINDS is the single source: it equals the payout_rail_kind DB enum', () => {
  // The route validates against PAYOUT_RAIL_KINDS and the union type derives
  // from it; pinning it to the DB enum closes the last drift edge so the three
  // representations (const, union, enum) can never diverge silently.
  assert.deepEqual([...PAYOUT_RAIL_KINDS], [...payoutRailKindEnum.enumValues])
})

test('isPayoutRailKind narrows known values and rejects everything else', () => {
  for (const k of PAYOUT_RAIL_KINDS) assert.ok(isPayoutRailKind(k))
  for (const bad of ['crypto', '', 'BANK', undefined, null, 7]) assert.equal(isPayoutRailKind(bad), false)
})

test('every rail kind used by a spec is a known PAYOUT_RAIL_KIND (no drift)', () => {
  for (const spec of Object.values(PAYOUT_COUNTRY_SPECS)) {
    for (const rail of spec.rails) {
      assert.ok(isPayoutRailKind(rail.kind), `rail kind '${rail.kind}' must be a known kind`)
    }
  }
})

test('DEFAULT_PAYOUT_CURRENCY is itself a supported payout currency', () => {
  assert.ok(PAYOUT_CURRENCIES.includes(DEFAULT_PAYOUT_CURRENCY))
})

test('payoutCurrencyForCountry resolves a market, else the launch default', () => {
  assert.equal(payoutCurrencyForCountry('GH'), 'GHS')
  assert.equal(payoutCurrencyForCountry('KE'), 'KES')
  assert.equal(payoutCurrencyForCountry('US'), DEFAULT_PAYOUT_CURRENCY) // unsupported → default
  assert.equal(payoutCurrencyForCountry(null), DEFAULT_PAYOUT_CURRENCY) // unknown → default
})

test('getPayoutSpec / getPayoutRail resolve and reject correctly', () => {
  assert.equal(getPayoutSpec('NG')?.currency, 'NGN')
  assert.equal(getPayoutSpec('US'), null)
  assert.ok(getPayoutRail('GH', 'mobile_money') !== null)
  assert.equal(getPayoutRail('NG', 'mobile_money'), null, 'NG has no MoMo rail')
  assert.equal(getPayoutRail('ZZ', 'bank'), null)
})

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

test('every rail rejects a fully-empty input', () => {
  for (const spec of Object.values(PAYOUT_COUNTRY_SPECS)) {
    for (const rail of spec.rails) {
      const err = rail.validate({ bank_code: '', account_number: '', account_name: '' })
      assert.ok(typeof err === 'string' && err.length > 0, `${spec.country}/${rail.kind} must reject empty`)
    }
  }
})

// --- account-number masking ------------------------------------------------

/**
 * The mask is what a payout account shows once saved, so the tail length is a
 * per-rail decision rather than a constant: revealing four digits of a 10-digit
 * MoMo number is a different disclosure from four of a 16-digit bank account.
 */
test('every payout rail masks its account number, keeping only the declared tail', () => {
  for (const spec of Object.values(PAYOUT_COUNTRY_SPECS)) {
    for (const rail of spec.rails) {
      const masked = rail.maskAccountNumber('0123456789')
      assert.match(
        masked,
        /^•+ \d+$/,
        `${spec.country}/${rail.kind} mask has an unexpected shape: ${masked}`,
      )
      const tail = masked.split(' ')[1]
      assert.ok(
        '0123456789'.endsWith(tail),
        `${spec.country}/${rail.kind} revealed digits that are not the tail`,
      )
      assert.ok(tail.length < 10, `${spec.country}/${rail.kind} revealed the whole number`)
    }
  }
})

test('the Kenyan bank rail masks all but the last four', () => {
  const rail = getPayoutRail('KE', 'bank')
  assert.ok(rail)
  assert.equal(rail.maskAccountNumber('0123456789'), '•••••• 6789')
})

test('the Ghanaian bank rail masks all but the last four', () => {
  // GH momo keeps 3 (covered above); the bank rail keeps 4 — different rails,
  // different disclosure, so both are pinned.
  const rail = getPayoutRail('GH', 'bank')
  assert.ok(rail)
  assert.equal(rail.maskAccountNumber('1234567890123'), '••••••••• 0123')
})
