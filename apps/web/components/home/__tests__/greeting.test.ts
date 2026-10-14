import { describe, expect, it } from 'vitest'
import { HOME_COPY } from '@/components/home/copy'
import { dateLine, greetingFor } from '@/components/home/greeting'

describe('greetingFor', () => {
  it('splits the day at noon and at six, local hours', () => {
    expect(greetingFor(0)).toBe(HOME_COPY.greeting.morning)
    expect(greetingFor(11)).toBe(HOME_COPY.greeting.morning)
    expect(greetingFor(12)).toBe(HOME_COPY.greeting.afternoon)
    expect(greetingFor(17)).toBe(HOME_COPY.greeting.afternoon)
    expect(greetingFor(18)).toBe(HOME_COPY.greeting.evening)
    expect(greetingFor(23)).toBe(HOME_COPY.greeting.evening)
  })
})

describe('dateLine', () => {
  it('names the weekday, day and month — no year the reader already knows', () => {
    expect(dateLine(new Date(2026, 8, 2))).toBe('Wednesday 2 September')
    expect(dateLine(new Date(2026, 0, 1))).not.toContain('2026')
  })

  it('follows a locale when one is given', () => {
    expect(dateLine(new Date(2026, 8, 2), 'en-US')).toBe('Wednesday, September 2')
  })
})
