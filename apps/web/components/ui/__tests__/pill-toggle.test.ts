import { describe, expect, it } from 'vitest'
import { EYEBROW_ATOM } from '@/components/ui/Eyebrow'
import { pillToggleClass } from '@/components/ui/pill-toggle'

describe('pillToggleClass', () => {
  it('is the eyebrow atom in a pill, and only the chosen one fills with ink', () => {
    const on = pillToggleClass(true)
    const off = pillToggleClass(false)
    for (const cls of [on, off]) {
      expect(cls).toContain(EYEBROW_ATOM)
      expect(cls).toContain('rounded-full')
    }
    expect(on).toContain('bg-content-primary')
    expect(on).toContain('text-surface-background')
    expect(off).not.toContain('bg-content-primary')
    // The unchosen pill lifts on hover; the chosen one is settled.
    expect(off).toContain('hover:border-border-strong')
    expect(on).not.toContain('hover:')
  })
})
