import { describe, expect, it } from 'vitest'
import { numberWord } from '../number-words'

/**
 * The section asides read derived counts aloud — "Five exits · four need
 * nobody but you", "Four on-chain transactions" — so the word has to track
 * the number, and fall back to the numeral rather than to a wrong word.
 */
describe('numberWord', () => {
  it('spells the small counts the page uses', () => {
    expect(numberWord(4)).toBe('four')
    expect(numberWord(5)).toBe('five')
    expect(numberWord(0)).toBe('zero')
    expect(numberWord(9)).toBe('nine')
  })

  it('capitalises on request, for a sentence-initial word', () => {
    expect(numberWord(5, true)).toBe('Five')
    expect(numberWord(4, false)).toBe('four')
  })

  it('falls back to the numeral past nine, and for anything that is not a small count', () => {
    expect(numberWord(10)).toBe('10')
    expect(numberWord(12, true)).toBe('12')
    expect(numberWord(-1)).toBe('-1')
    expect(numberWord(2.5)).toBe('2.5')
  })
})
