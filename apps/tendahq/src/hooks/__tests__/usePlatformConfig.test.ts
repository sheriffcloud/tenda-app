import { describe, expect, it } from 'vitest'
import { PLATFORM_CONFIG_DEFAULTS } from '@tenda/shared/constants/platform'
import { toPercent } from '../usePlatformConfig'

/**
 * The platform fee reaches the page through this conversion, and the API
 * client casts the response with `as PlatformConfig` without validating a
 * thing. So every value the wire could actually carry is enumerated here, not
 * just the one the server sends today.
 *
 * The two that matter are not crashes. A missing or renamed field used to
 * render "NaN%", and a null rendered "0%" — a specific, plausible, false claim
 * that Tenda charges nothing, printed under "What does Tenda charge?".
 */
describe('toPercent', () => {
  it('converts basis points to a display percentage', () => {
    expect(toPercent(PLATFORM_CONFIG_DEFAULTS.fee_bps)).toBe(2.5)
    expect(toPercent(PLATFORM_CONFIG_DEFAULTS.seeker_fee_bps)).toBe(1)
  })

  it('treats a genuinely free platform as free, not as absent', () => {
    expect(toPercent(0)).toBe(0)
  })

  /** A renamed or dropped field arrives as undefined — this is the NaN case. */
  it('rejects a missing field instead of rendering NaN%', () => {
    expect(toPercent(undefined)).toBeNull()
  })

  /** A nulled column arrives as null — this is the "0%" case, the worse one. */
  it('rejects null instead of claiming the platform is free', () => {
    expect(toPercent(null)).toBeNull()
  })

  it.each([
    ['a numeric string', '250'],
    ['a boolean', true],
    ['an object', { fee_bps: 250 }],
    ['an array', [250]],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects %s', (_label, value) => {
    expect(toPercent(value)).toBeNull()
  })

  /** "-5%" is a different wrong answer to the same question, not a fallback. */
  it('rejects a negative rate', () => {
    expect(toPercent(-250)).toBeNull()
  })

  it('never returns a value that would render as NaN', () => {
    for (const value of [undefined, null, Number.NaN, '250', {}, [], true, -1]) {
      const result = toPercent(value)
      expect(result === null || Number.isFinite(result)).toBe(true)
    }
  })
})
