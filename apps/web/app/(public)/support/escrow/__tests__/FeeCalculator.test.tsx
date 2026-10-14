/**
 * The fee calculator. The property that matters: it must answer what the CHAIN
 * will do, which is BigInt floor division over base units — not what a float
 * multiply rounded to four decimal places says.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  APP_INFO,
  USDC_DECIMALS,
  computePlatformFeeRaw,
  formatUnits,
  parseUnits,
} from '@tenda/shared'
import {
  EscrowFeeCalculator,
  feeBreakdown,
} from '@/app/(public)/support/escrow/FeeCalculator'

const BPS = Math.round(APP_INFO.fees.platformFeePct * 100)

describe('feeBreakdown', () => {
  it('agrees with the shared fee rule exactly, at every scale', () => {
    // Not a re-implementation: the assertion calls the same function the
    // server and useEscrowFee call, so a fork in this file fails here.
    for (const input of ['1', '25', '0.000001', '999.999999', '50000']) {
      // Shared `parseUnits` for the conversion — a different function from
      // the one under scrutiny, and the documented safe converter. Only the
      // FEE rule is being checked here, so only it must not be re-implemented.
      const raw = BigInt(parseUnits(input, USDC_DECIMALS) ?? '')
      const expected = computePlatformFeeRaw(raw, BPS)
      expect(feeBreakdown(input)).toEqual({
        fee: formatUnits(expected.toString(), USDC_DECIMALS),
        receives: formatUnits((raw - expected).toString(), USDC_DECIMALS),
      })
    }
  })

  it('FLOORS the sub-unit remainder, as the contract does', () => {
    // 0.000999 USDC × 250bps = 0.00002497500 → 24 base units, not 25.
    // The old float path printed 0.0000 here, which is a third answer again.
    expect(feeBreakdown('0.000999')).toEqual({ fee: '0.000024', receives: '0.000975' })
  })

  it('charges nothing when the fee floors below one base unit', () => {
    // A 1-base-unit gig cannot be charged 2.5% of itself.
    expect(feeBreakdown('0.000001')).toEqual({ fee: '0', receives: '0.000001' })
  })

  it('is exact past the precision a float would lose', () => {
    // 9,007,199,254.740993 USDC is above Number.MAX_SAFE_INTEGER in base units.
    const result = feeBreakdown('9007199254.740993')
    expect(result).not.toBeNull()
    expect(result?.fee).toBe('225179981.368524')
    expect(result?.receives).toBe('8782019273.372469')
  })

  it('refuses what is not a plain amount, rather than answering zero', () => {
    // Every one of these produced a 0 fee through `parseFloat(x) || 0`.
    for (const input of ['abc', '-5', '1e5', '1.2.3', '', '  ', '£10']) {
      expect(feeBreakdown(input)).toBeNull()
    }
  })

  it('accepts an amount pasted straight off a gig card', () => {
    // Cards render "1,250.5" — en-US grouping — so the calculator has to take
    // it back. The comma is a separator, never a decimal point.
    expect(feeBreakdown('1,250.5')).toEqual(feeBreakdown('1250.5'))
    expect(feeBreakdown('1,000')).toEqual({ fee: '25', receives: '975' })
    // …which means "1,5" reads as fifteen, the same assumption the display
    // side already makes.
    expect(feeBreakdown('1,5')).toEqual(feeBreakdown('15'))
  })

  it('refuses more precision than the asset can hold', () => {
    // Seven decimals is not a USDC amount; silently truncating it would show a
    // fee for an amount the escrow could never carry.
    expect(feeBreakdown('1.0000001')).toBeNull()
    expect(feeBreakdown('1.000001')).not.toBeNull()
  })

  it('handles zero without dividing by it', () => {
    expect(feeBreakdown('0')).toEqual({ fee: '0', receives: '0' })
  })
})

describe('EscrowFeeCalculator', () => {
  it('shows nothing until something is typed', () => {
    render(<EscrowFeeCalculator />)
    expect(screen.queryByText('Platform fee')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('breaks down a typed amount and NAMES the asset', () => {
    // The floor happens at the asset's precision, so hiding which asset it
    // means hides the thing that decides the last digit.
    render(<EscrowFeeCalculator />)
    return userEvent.type(screen.getByLabelText(/Gig amount in USDC/), '100').then(() => {
      expect(screen.getByText('2.5 USDC')).toBeInTheDocument()
      expect(screen.getByText('97.5 USDC')).toBeInTheDocument()
    })
  })

  it('says an unparseable amount is unparseable', async () => {
    const user = userEvent.setup()
    render(<EscrowFeeCalculator />)
    await user.type(screen.getByLabelText(/Gig amount in USDC/), 'abc')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    // …and shows no figures, rather than a confident zero.
    expect(screen.queryByText('Platform fee')).not.toBeInTheDocument()
  })

  it('ties the error to the field for a screen reader', async () => {
    const user = userEvent.setup()
    render(<EscrowFeeCalculator />)
    const field = screen.getByLabelText(/Gig amount in USDC/)
    await user.type(field, '-1')
    expect(field).toHaveAttribute('aria-describedby', 'fee-calc-error')
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'fee-calc-error')
  })

  it('drops the error again once the amount becomes valid', async () => {
    const user = userEvent.setup()
    render(<EscrowFeeCalculator />)
    const field = screen.getByLabelText(/Gig amount in USDC/)
    await user.type(field, 'x')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await user.clear(field)
    await user.type(field, '10')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(field).not.toHaveAttribute('aria-describedby')
  })

  it('states the rate it used', () => {
    render(<EscrowFeeCalculator />)
    expect(
      screen.getByRole('heading', { name: new RegExp(`${APP_INFO.fees.platformFeePct}% platform fee`) }),
    ).toBeInTheDocument()
  })
})
