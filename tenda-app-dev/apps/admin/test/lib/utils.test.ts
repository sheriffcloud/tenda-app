import { test, expect } from 'vitest'
import { cn, lamportsToSol, bpsToPercent, secondsToDays } from '@/lib/utils'

test('cn: merges class names and de-dupes conflicting tailwind utilities', () => {
  expect(cn('px-2', 'px-4')).toBe('px-4') // tw-merge keeps the last padding
  expect(cn('text-sm', false, undefined, 'font-bold')).toBe('text-sm font-bold')
  expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c')
})

test('lamportsToSol: 9-dp conversion fixed to 3 places', () => {
  expect(lamportsToSol(1_000_000_000)).toBe('1.000')
  expect(lamportsToSol(500_000_000)).toBe('0.500')
  expect(lamportsToSol(0)).toBe('0.000')
})

test('bpsToPercent: 100 bps == 1.00%', () => {
  expect(bpsToPercent(250)).toBe('2.50')
  expect(bpsToPercent(100)).toBe('1.00')
  expect(bpsToPercent(0)).toBe('0.00')
})

test('secondsToDays: seconds to days, one decimal', () => {
  expect(secondsToDays(86_400)).toBe('1.0')
  expect(secondsToDays(172_800)).toBe('2.0')
  expect(secondsToDays(43_200)).toBe('0.5')
})
