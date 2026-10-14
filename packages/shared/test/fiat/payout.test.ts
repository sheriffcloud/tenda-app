import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAYOUT_COUNTRY_SPECS,
  SUPPORTED_PAYOUT_COUNTRIES,
  PAYOUT_CURRENCIES,
  derivePayoutCurrencies,
  PAYOUT_RAIL_KINDS,
  getPayoutSpec,
  countryDisplayName,
  getPayoutRail,
  isPayoutRailKind,
  payoutCurrencyForCountry,
  type PayoutCountrySpec,
} from '../../src/fiat/payout'
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../src/constants/currencies'
import { payoutRailKindEnum } from '../../src/db/schema/fiat'

// ---------- registry shape -------------------------------------------------

test('payout countries are exactly NG, KE, GH, ZA, PH, AE', () => {
  assert.deepEqual(new Set(SUPPORTED_PAYOUT_COUNTRIES), new Set(['NG', 'KE', 'GH', 'ZA', 'PH', 'AE']))
})

/**
 * Deduping is NOT what this shows — every live market has a currency to itself,
 * so it would pass with the dedupe deleted. That property is pinned against a
 * fixture at the bottom of this file. What this pins is the list itself: the
 * live currencies, and that each is one the product can format.
 */
test('PAYOUT_CURRENCIES is exactly the live markets, all of them supported', () => {
  assert.deepEqual(new Set(PAYOUT_CURRENCIES), new Set(['NGN', 'KES', 'GHS', 'ZAR', 'PHP', 'AED']))
  for (const c of PAYOUT_CURRENCIES) {
    assert.ok(SUPPORTED_CURRENCIES.includes(c), `${c} must be a supported currency`)
  }
})

test('every market declares a rail, matches its key, and collects every column', () => {
  for (const [code, spec] of Object.entries(PAYOUT_COUNTRY_SPECS)) {
    assert.ok(spec.rails.length > 0, `${code} declares no rail`)
    assert.equal(spec.country, code, `${code} spec disagrees with its registry key`)
    const kinds = spec.rails.map((r) => r.kind)
    assert.equal(new Set(kinds).size, kinds.length, `${code} repeats a rail kind`)
    for (const rail of spec.rails) {
      // A column the form never collects is a column that saves blank.
      const columns = new Set(rail.fields.map((f) => f.column))
      for (const required of ['bank_code', 'account_number', 'account_name'] as const) {
        assert.ok(columns.has(required), `${code}/${rail.kind} never collects ${required}`)
      }
    }
  }
})

/**
 * One country maps to exactly one currency is NOT checked here, or anywhere: it
 * is a property of the TYPE. `PayoutCountrySpec.currency` is a single field, so
 * no spec can declare two and no runtime assertion could ever fail for it. The
 * thing worth checking is what a spec can still get wrong.
 */
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

test('payoutCurrencyForCountry resolves every market to its own currency', () => {
  for (const country of SUPPORTED_PAYOUT_COUNTRIES) {
    const currency = payoutCurrencyForCountry(country)
    assert.notEqual(currency, null, `${country} is a market but resolves no currency`)
    assert.equal(currency, PAYOUT_COUNTRY_SPECS[country].currency)
  }
  assert.equal(payoutCurrencyForCountry('ZA'), 'ZAR')
  assert.equal(payoutCurrencyForCountry('PH'), 'PHP')
  assert.equal(payoutCurrencyForCountry('AE'), 'AED')
})

/**
 * NO FALLBACK, deliberately. This used to answer NGN for anything it did not
 * recognise, which made "we do not serve this country" indistinguishable from
 * "this account is Nigerian" — so an unrecognised country SATISFIED the guard
 * on an NGN-priced offer instead of failing it, and the mobile composer showed
 * NGN to a Kenyan until they picked an account.
 */
test('payoutCurrencyForCountry answers null rather than guessing a currency', () => {
  assert.equal(payoutCurrencyForCountry('US'), null)
  assert.equal(payoutCurrencyForCountry('ZW'), null)
  assert.equal(payoutCurrencyForCountry(null), null)
  assert.equal(payoutCurrencyForCountry(''), null)
})

test('getPayoutSpec / getPayoutRail resolve and reject correctly', () => {
  assert.equal(getPayoutSpec('NG')?.currency, 'NGN')
  assert.equal(getPayoutSpec('US'), null)
  assert.ok(getPayoutRail('GH', 'mobile_money') !== null)
  assert.equal(getPayoutRail('NG', 'mobile_money'), null, 'NG has no MoMo rail')
  assert.equal(getPayoutRail('ZA', 'mobile_money'), null, 'ZA has no wallet rail')
  assert.ok(getPayoutRail('PH', 'mobile_money') !== null, 'PH e-wallets are first-class')
  assert.equal(getPayoutRail('ZZ', 'bank'), null)
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

test('countryDisplayName names a payout market, and passes anything else through', () => {
  assert.equal(countryDisplayName('NG'), 'Nigeria')
  assert.equal(countryDisplayName('KE'), 'Kenya')
  assert.equal(countryDisplayName('GH'), 'Ghana')
  // Not a payout market, but still where the account says it is. A dash here
  // would say less to the reader than the code does.
  assert.equal(countryDisplayName('ZW'), 'ZW')
})

test('countryDisplayName answers null for an account with no country', () => {
  // The column is nullable; the caller renders NOTHING rather than a
  // placeholder that implies a country was withheld.
  assert.equal(countryDisplayName(null), null)
  assert.equal(countryDisplayName(''), null)
})

test('every payout market has a display name, so none can fall back to its code', () => {
  for (const country of SUPPORTED_PAYOUT_COUNTRIES) {
    assert.notEqual(countryDisplayName(country), country)
  }
})

/**
 * The registry cannot exercise this: every live market has a currency to
 * itself, so deduping is a no-op against real data and an assertion over
 * PAYOUT_CURRENCIES would pass just as well with the dedupe deleted.
 *
 * A fixture can. One currency serving several countries is allowed by the
 * model — one country, one currency, not one currency, one country — and it is
 * where the next markets are heading, so the behaviour is pinned before the
 * data arrives rather than after a picker starts showing "USD" twice.
 */
test('derivePayoutCurrencies keeps one entry per currency, in registry order', () => {
  const spec = (country: string, currency: SupportedCurrency): PayoutCountrySpec => ({
    country,
    countryName: country,
    flag: '🏳️',
    currency,
    rails: [],
  })
  assert.deepEqual(
    derivePayoutCurrencies([spec('AE', 'AED'), spec('QA', 'AED'), spec('NG', 'NGN')]),
    ['AED', 'NGN'],
  )
  assert.deepEqual(derivePayoutCurrencies([]), [])
})
