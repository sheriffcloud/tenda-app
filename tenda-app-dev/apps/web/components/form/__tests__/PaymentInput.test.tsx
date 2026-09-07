/**
 * PaymentInput — what the field accepts, and what base-unit string it hands
 * back.
 *
 * The money math itself is `@tenda/shared`'s (`gig-budget.test.ts` proves it
 * BigInt-exact). What is proved HERE is the wiring: that the component holds
 * text, emits raw, and that the two never disagree — which is the property
 * the old float version silently broke.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ASSET_META, gigAmountBounds } from '@tenda/shared'
import { PaymentInput } from '@/components/form/PaymentInput'

function setup(value = '', asset = 'USDC_SOL') {
  const onChange = vi.fn()
  // From the registry, not a local map — a test that hardcodes the symbol
  // stops testing the asset the moment the registry changes it.
  const symbol = ASSET_META[asset].symbol
  render(<PaymentInput asset={asset} value={value} onChange={onChange} />)
  return { onChange, input: screen.getByLabelText(`Budget in ${symbol}`) as HTMLInputElement }
}

test('converts display units to a raw STRING via the asset decimals', () => {
  const { onChange, input } = setup()
  fireEvent.change(input, { target: { value: '12.5' } })
  expect(onChange).toHaveBeenLastCalledWith('12500000')
})

test('an 18-decimal budget survives exactly — the case a number cannot hold', () => {
  // The regression the migration exists for. Asserted digit-for-digit, and
  // against what the old float math produced, so it cannot pass by accident.
  const { onChange, input } = setup('', 'cUSD')
  fireEvent.change(input, { target: { value: '1250.75' } })
  expect(onChange).toHaveBeenLastCalledWith('1250750000000000000000')
  expect(String(Math.round(1250.75 * 10 ** 18))).not.toBe('1250750000000000000000')
})

test('does NOT clamp at the max bound — it reports the number that was typed', () => {
  // Deliberate change: clamping rewrote a budget after the reader stopped
  // looking at it. The rail is enforced by the budget requirement, which now
  // names it, rather than by silently editing the field.
  const { onChange, input } = setup()
  const { max_raw } = gigAmountBounds('USDC_SOL')
  fireEvent.change(input, { target: { value: '99999999999' } })
  expect(onChange).toHaveBeenLastCalledWith('99999999999000000')
  expect(BigInt('99999999999000000')).toBeGreaterThan(BigInt(max_raw))
})

test('refuses the digit past the asset precision instead of rounding it', () => {
  // What is on screen has to be what gets escrowed: the 7th decimal never
  // enters the field, so the text and the raw cannot drift apart.
  const { onChange, input } = setup()
  fireEvent.change(input, { target: { value: '1.9999999' } })
  expect(input.value).toBe('1.999999')
  expect(onChange).toHaveBeenLastCalledWith('1999999')
})

test('a trailing decimal point keeps the budget it already has', () => {
  // Mid-typing '12.' must not read as "no budget" while 12 is visible.
  const { onChange, input } = setup()
  fireEvent.change(input, { target: { value: '12.' } })
  expect(input.value).toBe('12.')
  expect(onChange).toHaveBeenLastCalledWith('12000000')
})

test('a LEADING decimal point is 0.x, not a vanished budget', () => {
  // '.5' is what gets typed on a numeric keypad. It used to show in the field
  // and report no budget at all.
  const { onChange, input } = setup()
  fireEvent.change(input, { target: { value: '.5' } })
  expect(input.value).toBe('.5')
  expect(onChange).toHaveBeenLastCalledWith('500000')
})

test("invalid or negative input reads as no budget (''), not the last value", () => {
  const { onChange, input } = setup()
  fireEvent.change(input, { target: { value: '12' } })
  expect(onChange).toHaveBeenLastCalledWith('12000000')
  fireEvent.change(input, { target: { value: 'abc' } })
  expect(onChange).toHaveBeenLastCalledWith('')
  // The minus never enters the field at all, so '-5' is 5, not a negative raw.
  fireEvent.change(input, { target: { value: '-5' } })
  expect(input.value).toBe('5')
  expect(onChange).toHaveBeenLastCalledWith('5000000')
})

test('seeds the field from an initial raw value — a resumed draft', () => {
  const { input } = setup('2000000')
  expect(input.value).toBe('2')
})

test('seeds an 18-decimal draft without losing a digit', () => {
  const { input } = setup('1250750000000000000000', 'cUSD')
  expect(input.value).toBe('1250.75')
})

test('shows the rail in the asset being spent, both ends of it', () => {
  setup()
  expect(screen.getByText('Budget 1 – 50000 USDC')).toBeInTheDocument()
})
