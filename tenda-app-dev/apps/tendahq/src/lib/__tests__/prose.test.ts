import { describe, expect, it } from 'vitest'
import { prose } from '../prose'

/**
 * The joiner every derived list on the page runs through. Its failure mode is
 * not a crash — it is a sentence that reads wrong to a reader and to nobody
 * else, which is exactly the kind of defect a landing page ships for months.
 */
describe('prose', () => {
  it('renders a single item with no conjunction', () => {
    expect(prose(['Solana'])).toBe('Solana')
  })

  it('joins two items with "and" and no comma', () => {
    expect(prose(['Base', 'Celo'])).toBe('Base and Celo')
  })

  it('commas all but the last, which takes the "and"', () => {
    expect(prose(['Solana', 'Base', 'Celo'])).toBe('Solana, Base and Celo')
  })

  it('keeps the pattern past three', () => {
    expect(prose(['a', 'b', 'c', 'd'])).toBe('a, b, c and d')
  })

  /**
   * The empty case is reachable: every derived list filters (by namespace, by
   * gas policy, by whether a chain declares a strength), so a filter that
   * matches nothing must yield an empty string, not "undefined" or a dangling
   * " and " rendered into the page.
   */
  it('returns an empty string for an empty list rather than a fragment', () => {
    expect(prose([])).toBe('')
  })
})
