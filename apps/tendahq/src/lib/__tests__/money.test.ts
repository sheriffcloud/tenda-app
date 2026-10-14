import { describe, expect, it } from 'vitest'
import { money2 } from '../money'

describe('money2', () => {
  it('prints whole and fractional amounts at two decimals, as MoneyText does', () => {
    expect(money2('12')).toBe('12.00')
    expect(money2('11.7')).toBe('11.70')
    expect(money2(0.3)).toBe('0.30')
    expect(money2('48.20')).toBe('48.20')
  })

  it('leaves a non-numeric string alone rather than printing NaN', () => {
    expect(money2('—')).toBe('—')
    expect(money2('')).toBe('0.00')
  })
})
