import { describe, expect, it } from 'vitest'
import { ASSET_META } from '@tenda/shared/constants/assets'
import { PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared/constants/platform'
import { GIG_ASSET_IDS } from '../chains'
import {
  APPROVAL_WINDOW_HOURS,
  FEE_EXAMPLE,
  FEE_EXAMPLE_RAW,
  FEE_PCT,
  SEEKER_FEE_PCT,
} from '../fees'

/**
 * The worked example is the only arithmetic on the landing, and it is the
 * arithmetic a reader will check against their own gig. It has to agree with
 * the contract's settlement math — floor division, then `amount − fee` — and
 * with the configured rate, not with the numbers someone typed in 2026.
 */
describe('fee facts', () => {
  it('derives the display percentages from the shared platform defaults', () => {
    expect(FEE_PCT).toBe(String(PLATFORM_CONFIG_DEFAULTS.fee_bps / 100))
    expect(SEEKER_FEE_PCT).toBe(String(PLATFORM_CONFIG_DEFAULTS.seeker_fee_bps / 100))
  })

  it('derives the review window in whole hours from the shared default', () => {
    expect(APPROVAL_WINDOW_HOURS).toBe(PLATFORM_CONFIG_DEFAULTS.approval_window_seconds / 3600)
  })

  /** The Seeker rate is a DISCOUNT; the contracts reject seekerFee > fee. */
  it('keeps the seeker rate at or below the standard rate', () => {
    expect(Number(SEEKER_FEE_PCT)).toBeLessThanOrEqual(Number(FEE_PCT))
  })

  /**
   * ASSERTED IN BASE UNITS, deliberately. An earlier version of these two
   * tests read the formatted strings back through Number(), which rounds at
   * 2dp — so changing the fee by a single base unit left every assertion
   * green. The contract works in integers; so must the test.
   */
  it('splits the example so fee + payout is exactly the locked principal', () => {
    expect(FEE_EXAMPLE_RAW.fee + FEE_EXAMPLE_RAW.payout).toBe(FEE_EXAMPLE_RAW.principal)
  })

  it('charges the example exactly the configured rate, to the base unit', () => {
    const expected = Math.floor(
      (FEE_EXAMPLE_RAW.principal * PLATFORM_CONFIG_DEFAULTS.fee_bps) / 10_000,
    )
    expect(FEE_EXAMPLE_RAW.fee).toBe(expected)
  })

  /** Floor, never round or ceil: the contracts truncate toward zero. */
  it('never charges more than the exact percentage', () => {
    expect(FEE_EXAMPLE_RAW.fee * 10_000).toBeLessThanOrEqual(
      FEE_EXAMPLE_RAW.principal * PLATFORM_CONFIG_DEFAULTS.fee_bps,
    )
  })

  it('renders the display strings from those same base units', () => {
    expect(Number(FEE_EXAMPLE.feeAmount)).toBeCloseTo(
      FEE_EXAMPLE_RAW.fee / FEE_EXAMPLE_RAW.baseUnitsPerToken,
      2,
    )
  })

  /**
   * A money column that renders "11.7" beside "12" looks like a bug to the
   * reader even though the value is right, so the formatter pads to 2dp for
   * fractional amounts — and must NOT pad whole ones into "12.00".
   */
  it('formats fractional amounts to two decimals and whole ones without', () => {
    expect(FEE_EXAMPLE.payoutAmount).toMatch(/^\d+\.\d{2}$/)
    expect(FEE_EXAMPLE.feeAmount).toMatch(/^\d+\.\d{2}$/)
    expect(FEE_EXAMPLE.lockedAmount).toMatch(/^\d+$/)
  })

  /**
   * ANCHORED TO THE ASSET REGISTRY, not to itself. Every other assertion here
   * compares raw values that all scale with the base unit, so changing it from
   * 1e6 to 1e8 left the whole suite green — the arithmetic stayed internally
   * consistent while the example silently described a different token. A test
   * about units has to reach outside the module for them.
   */
  it('scales the example by the gig asset\'s real decimals', () => {
    expect(FEE_EXAMPLE_RAW.baseUnitsPerToken).toBe(
      10 ** ASSET_META[GIG_ASSET_IDS[0]].decimals,
    )
    expect(FEE_EXAMPLE_RAW.principal).toBe(
      Number(FEE_EXAMPLE.lockedAmount) * FEE_EXAMPLE_RAW.baseUnitsPerToken,
    )
  })

  /**
   * `toFixed(2)` would render a sub-cent fee as "0.00" — a worked example that
   * silently shows Tenda taking nothing. Bounded by the fixed principal today,
   * but the assertion is what keeps it bounded.
   */
  it('never renders a fee or payout that rounds away to zero', () => {
    expect(FEE_EXAMPLE_RAW.fee).toBeGreaterThan(0)
    expect(FEE_EXAMPLE_RAW.payout).toBeGreaterThan(0)
    expect(Number(FEE_EXAMPLE.feeAmount)).toBeGreaterThan(0)
    expect(Number(FEE_EXAMPLE.payoutAmount)).toBeGreaterThan(0)
  })

  it('labels each example row with its unit and the rate', () => {
    expect(FEE_EXAMPLE.locked).toBe(`${FEE_EXAMPLE.lockedAmount} USDC`)
    expect(FEE_EXAMPLE.payout).toBe(`${FEE_EXAMPLE.payoutAmount} USDC`)
  })
})
