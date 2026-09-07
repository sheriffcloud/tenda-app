/**
 * lib/browser-country — the locale-region FALLBACK behind the account
 * country. Positive: a supported region comes through uppercase. Negative:
 * unsupported regions, script subtags and bare languages yield null — a
 * non-null answer here reads as "country selected" to composer validation,
 * so anything the picker can't display must never come through.
 */
import { describe, expect, it } from 'vitest'
import { getBrowserCountry } from '@/lib/browser-country'

describe('getBrowserCountry', () => {
  it('extracts a supported market region from a region-carrying locale', () => {
    expect(getBrowserCountry('en-ng')).toBe('NG')
    expect(getBrowserCountry('en-US')).toBe('US')
  })

  it('an unsupported region or script subtag yields null, never a junk "country"', () => {
    expect(getBrowserCountry('pt-BR')).toBeNull() // real region, unsupported market
    expect(getBrowserCountry('zh-Hans-CN')).toBeNull() // old naive split answered 'HANS'
  })

  it('a bare language locale yields null, never a guessed country', () => {
    expect(getBrowserCountry('en')).toBeNull()
  })

  it('the zero-argument call answers from the runtime locale without throwing', () => {
    const result = getBrowserCountry()
    expect(result === null || /^[A-Z]{2}$/.test(result)).toBe(true)
  })
})
