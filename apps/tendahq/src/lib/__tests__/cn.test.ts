import { describe, expect, it } from 'vitest'
import { cn } from '../cn'

/**
 * Every conditional class on the page runs through this. Its whole job is
 * dropping falsy values — the pattern is `cond && 'class'`, so a joiner that
 * kept `false` would emit `class="… false …"` into the markup.
 */
describe('cn', () => {
  it('joins truthy class names with a single space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('drops every falsy value the conditional pattern produces', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('returns an empty string when nothing is truthy', () => {
    expect(cn(false, null, undefined)).toBe('')
    expect(cn()).toBe('')
  })

  /** `0` is falsy, and a class named "0" is never what the caller meant. */
  it('drops a zero rather than emitting it as a class', () => {
    expect(cn('a', 0, 'b')).toBe('a b')
  })
})
