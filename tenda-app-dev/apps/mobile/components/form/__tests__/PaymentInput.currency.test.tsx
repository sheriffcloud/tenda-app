/**
 * PaymentInput when the DENOMINATION changes underneath it (#66).
 *
 * Split from PaymentInput.test.tsx, which these cases took past the 300-line
 * limit, and a coherent file on its own: everything here is about a currency
 * switch, where the budget is preserved and the field is restated. The two
 * directions are the point — before #66 the cached one silently kept the old
 * currency's valuation under the new suffix while the uncached one re-priced
 * the typed number, so the same gesture produced two different budgets.
 */
import { TextInput } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'

type Rates = Record<string, number> | null
let mockRates: Rates = null
let mockCurrency = 'NGN'
jest.mock('@/stores/exchange-rate.store', () => ({
  useExchangeRateStore: (sel: (s: { rates: Rates }) => unknown) => sel({ rates: mockRates }),
}))
jest.mock('@/stores/settings.store', () => ({
  useSettingsStore: (sel: (s: { currency: string }) => unknown) => sel({ currency: mockCurrency }),
}))
jest.mock('react-native-unistyles', () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        brand: { primary: '#0a0', primarySurface: '#efe' },
        surface: { inset: '#eee' },
        content: { primary: '#000', tertiary: '#999' },
      },
    },
  }),
}))
jest.mock('@/components/ui/Text', () => {
  const { Text } = require('react-native')
  return { Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }
})

import { PaymentInput } from '@/components/form/PaymentInput'

/** The SOL rate cache the component converts through. */
const RATES = { NGN: 150_000, USD: 100 }

function setup(value = '', asset = 'USDC_SOL') {
  const onChange = jest.fn()
  const view = render(<PaymentInput asset={asset} value={value} onChange={onChange} />)
  return { onChange, view, field: () => screen.UNSAFE_getByType(TextInput) }
}

/** Switch to the asset tab, whose label is the asset symbol. */
function toAssetMode(symbol = 'USDC') {
  fireEvent.press(screen.getByText(symbol))
}

beforeEach(() => {
  mockRates = RATES
  mockCurrency = 'NGN'
})

describe('a currency switch (#66)', () => {
  /**
   * The budget is PRESERVED and the field is RESTATED: switching currency
   * changes how the same money is written down, never how much it is. The
   * pair of cases below is the whole point — before #66 the cached direction
   * silently kept the old currency's valuation under the new suffix, and the
   * uncached one re-priced the typed number, so the same gesture produced two
   * different budgets depending on what happened to be in the rate cache.
   */
  const BOTH_CACHED = { NGN: 150_000, KES: 15_000, USD: 100 }

  test('to a CACHED currency: the budget holds and the field restates it', () => {
    mockRates = BOTH_CACHED
    const { onChange, view, field } = setup()
    fireEvent.changeText(field(), '150000')
    // 150000 NGN / 1500 NGN-per-USDC = 100 USDC
    expect(onChange).toHaveBeenLastCalledWith('100000000')
    onChange.mockClear()

    mockCurrency = 'KES'
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)

    // 100 USDC at 150 KES-per-USDC = 15000 KES — the same money, restated.
    expect(field().props.value).toBe('15000')
    // And NOT re-priced: the raw is untouched, so nothing is emitted at all.
    expect(onChange).not.toHaveBeenCalled()
  })

  test('to an UNCACHED currency: the field waits, and the budget survives the wait', () => {
    // The direction that used to re-price. The rate goes null and back, which
    // is exactly the transition #49's effect was built for — it must no longer
    // read the on-screen number as the new currency.
    mockRates = { NGN: 150_000, USD: 100 }
    const { onChange, view, field } = setup()
    fireEvent.changeText(field(), '150000')
    expect(onChange).toHaveBeenLastCalledWith('100000000')
    onChange.mockClear()

    mockCurrency = 'KES'
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)
    // No KES rate yet: the field cannot honestly show a KES number, so it shows
    // none. The BUDGET is untouched — the step stays satisfied through the gap.
    expect(field().props.value).toBe('')
    expect(onChange).not.toHaveBeenCalled()

    mockRates = BOTH_CACHED
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)
    // Same destination as the cached direction, which is the whole fix.
    expect(field().props.value).toBe('15000')
    expect(onChange).not.toHaveBeenCalled()
  })

  test('typing during the wait beats the restatement — it is the newer intent', () => {
    // The gap the uncached direction opens: the field is blank while the rate
    // is unknown, and the reader is free to type a NEW budget into it. That
    // number is already denominated in the new currency and is what they mean
    // now, so the pending restatement of the OLD budget must be abandoned
    // rather than written over the top of it.
    mockRates = { NGN: 150_000, USD: 100 }
    const { onChange, view, field } = setup()
    fireEvent.changeText(field(), '150000')
    expect(onChange).toHaveBeenLastCalledWith('100000000')
    onChange.mockClear()

    mockCurrency = 'KES'
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)
    expect(field().props.value).toBe('')

    // They retype while the KES rate is still out.
    fireEvent.changeText(field(), '3000')
    expect(onChange).not.toHaveBeenCalled() // no rate yet, so nothing to emit

    mockRates = BOTH_CACHED
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)

    // Their 3000 KES stands, converted at the KES rate — 3000/150 = 20 USDC.
    expect(field().props.value).toBe('3000')
    expect(onChange).toHaveBeenLastCalledWith('20000000')
  })

  test('typing a zero during the wait clears the budget rather than stranding it', () => {
    // The other arm of "typing wins": what they typed converts to no budget.
    // The old raw must go with it — leaving it would put '0' on screen above a
    // budget of 100 USDC, which is the dishonesty this task exists to remove.
    mockRates = { NGN: 150_000, USD: 100 }
    const { onChange, view, field } = setup()
    fireEvent.changeText(field(), '150000')
    onChange.mockClear()

    mockCurrency = 'KES'
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)
    fireEvent.changeText(field(), '0')

    mockRates = BOTH_CACHED
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)

    expect(field().props.value).toBe('0')
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  test('a second switch while waiting lands on the second currency, not the first', () => {
    // Switching again before the first new rate arrives must not leave a
    // restatement pending: when the abandoned currency's rate finally lands it
    // would rewrite the field in a currency the reader has already left.
    mockRates = { NGN: 150_000, USD: 100, GHS: 1_500 }
    const { onChange, view, field } = setup()
    fireEvent.changeText(field(), '150000')
    expect(onChange).toHaveBeenLastCalledWith('100000000')
    onChange.mockClear()

    mockCurrency = 'KES' // uncached — the field blanks and a restatement pends
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)
    expect(field().props.value).toBe('')

    mockCurrency = 'GHS' // cached — restate here and now
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)
    // 100 USDC at 15 GHS-per-USDC = 1500 GHS.
    expect(field().props.value).toBe('1500')

    // A later GHS rate tick must find nothing pending. This step is the one
    // that proves the pending flag was cleared: it moves `rate`, so the effect
    // actually re-runs — an abandoned-currency rate landing would not, since
    // neither the rate for GHS nor the currency would have changed.
    mockRates = { NGN: 150_000, USD: 100, GHS: 3_000 }
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)
    expect(field().props.value).toBe('1500')
    expect(onChange).not.toHaveBeenCalled()
  })

  test('a rate cache carrying ZERO for the new currency keeps waiting', () => {
    // Zero is a non-answer, not a rate: restating at it would divide by zero,
    // and a budget of 0 KES is not what anyone meant. The field keeps waiting
    // until a real rate lands — the same reading #64 settled for a balance the
    // node declined to give.
    mockRates = { NGN: 150_000, USD: 100 }
    const { onChange, view, field } = setup()
    fireEvent.changeText(field(), '150000')
    onChange.mockClear()

    mockCurrency = 'KES'
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)
    expect(field().props.value).toBe('')

    mockRates = { NGN: 150_000, USD: 100, KES: 0 }
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)
    expect(field().props.value).toBe('')
    expect(onChange).not.toHaveBeenCalled()

    mockRates = BOTH_CACHED
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)
    expect(field().props.value).toBe('15000')
  })

  test('the ASSET tab is unaffected — its number is not denominated in fiat', () => {
    mockRates = BOTH_CACHED
    const { onChange, view, field } = setup()
    toAssetMode()
    fireEvent.changeText(field(), '100')
    expect(onChange).toHaveBeenLastCalledWith('100000000')
    onChange.mockClear()

    mockCurrency = 'KES'
    view.rerender(<PaymentInput asset="USDC_SOL" value="100000000" onChange={onChange} />)

    expect(field().props.value).toBe('100')
    expect(onChange).not.toHaveBeenCalled()
  })

  test('a switch with nothing typed emits nothing and shows nothing', () => {
    // The empty case has its own arm: with no raw there is no budget to
    // preserve, and restating '' must not put a 0 in the field.
    mockRates = BOTH_CACHED
    const { onChange, view, field } = setup()

    mockCurrency = 'KES'
    view.rerender(<PaymentInput asset="USDC_SOL" value="" onChange={onChange} />)

    expect(field().props.value).toBe('')
    expect(onChange).not.toHaveBeenCalled()
  })
})
