/**
 * The money helpers behind the budget field, tested directly.
 *
 * They were inside PaymentInput.tsx until #66, reachable only by rendering the
 * component and reading a TextInput's props — which is a fine way to test a
 * field and a poor way to test arithmetic. What is left here is the fiat<->raw
 * conversion pair, whose off-by-a-decimal errors are exactly the kind a render
 * test reads past.
 *
 * The rate-SELECTION arms are no longer this file's: #76 moved that rule to
 * @tenda/shared so the feed's gig cards could share it, and its table of cases
 * went with it. Only the re-export's wiring is asserted below.
 */
import { fiatRatePerUnit, fiatTextToRaw, rawToFiatText } from '../payment-input.fiat'

/** NGN 150,000 per SOL, USD 100 per SOL -> NGN 1,500 per USDC. */
const RATES = { NGN: 150_000, USD: 100 }

describe('fiatRatePerUnit (re-exported from @tenda/shared since #76)', () => {
  // The RULE and its arms — stable vs SOL vs a native token this cache cannot
  // price vs an unknown asset — are owned and exhaustively tested in
  // packages/shared/test/utils/currency-display.test.ts, because the feed's gig
  // cards need the same answer as this field and two copies disagreeing is the
  // bug #76 was filed for. Restating that table here would rebuild the second
  // copy in the test suite instead of the source.
  //
  // What is still this module's to prove is the WIRING: that the name it
  // re-exports resolves, and resolves to the corrected rule rather than to
  // something that merely type-checks. Both arms of the division are asserted,
  // so a re-export pointing at a stub or at the old SOL-only rule fails here.
  test('the re-export is the shared rule, both arms', () => {
    expect(fiatRatePerUnit(RATES, 'NGN', 'USDC_SOL')).toBe(1_500)
    expect(fiatRatePerUnit(RATES, 'NGN', 'SOL_DEVNET')).toBe(150_000)
  })
})

describe('fiatTextToRaw', () => {
  test('converts a fiat amount into base units at the asset decimals', () => {
    expect(fiatTextToRaw('150000', 1_500, 'USDC_SOL')).toBe('100000000')
  })

  test('a half-typed number still converts — a trailing point reads as the number', () => {
    // The field hands over whatever is in it mid-entry, so '1500.' arrives
    // routinely. It must price as 1500 rather than as nothing.
    expect(fiatTextToRaw('1500.', 1_500, 'USDC_SOL')).toBe('1000000')
  })

  test('a lone point is not a budget', () => {
    // The other end of the same keystroke: '.' parses to NaN, which
    // gigBudgetFromUnits refuses rather than emitting a zero budget.
    expect(fiatTextToRaw('.', 1_500, 'USDC_SOL')).toBe('')
  })

  test('an empty field converts to no budget, not to zero', () => {
    expect(fiatTextToRaw('', 1_500, 'USDC_SOL')).toBe('')
  })
})

describe('rawToFiatText', () => {
  test('writes a budget in the currency, trimmed', () => {
    // 100 USDC at 150 KES-per-USDC. `toFixed(2)` pads this to '15000.00'; the
    // field must show what a person would type.
    expect(rawToFiatText('100000000', 150, 'USDC_SOL')).toBe('15000')
  })

  test('keeps the cents that matter', () => {
    expect(rawToFiatText('100000000', 15.005, 'USDC_SOL')).toBe('1500.5')
  })

  test('round-trips against fiatTextToRaw at the same rate', () => {
    // The property that makes option (b) safe: restating a budget and reading
    // it back must land on the budget it started from.
    const raw = fiatTextToRaw('150000', 1_500, 'USDC_SOL')
    expect(fiatTextToRaw(rawToFiatText(raw, 1_500, 'USDC_SOL'), 1_500, 'USDC_SOL')).toBe(raw)
  })

  test('no budget yields no text — an unset field, not a zero', () => {
    expect(rawToFiatText('', 1_500, 'USDC_SOL')).toBe('')
  })

  test('an 18-decimal budget survives the trip', () => {
    // 1250.75 cUSD at 2 fiat-per-unit. The raw is past what a float holds, so
    // a naive implementation loses digits before the multiply.
    expect(rawToFiatText('1250750000000000000000', 2, 'cUSD')).toBe('2501.5')
  })

  test('a rate that is not a positive number yields nothing', () => {
    // The function is exported, so its contract is not only what the component
    // happens to pass. Zero would make every budget worth nothing and Infinity
    // would make the multiply non-finite; both answer '' rather than emitting
    // '0' or 'Infinity' into the field.
    expect(rawToFiatText('100000000', 0, 'USDC_SOL')).toBe('')
    expect(rawToFiatText('100000000', Number.POSITIVE_INFINITY, 'USDC_SOL')).toBe('')
  })

  test('a rate so large the amount leaves decimal notation yields nothing', () => {
    // `toFixed` returns exponential above 1e21, which is not a decimal string —
    // the same end `gigBudgetFromUnits` refuses explicitly. A blank field beats
    // one reading '1.5e+23'.
    expect(rawToFiatText('100000000', 1e21, 'USDC_SOL')).toBe('')
  })
})
