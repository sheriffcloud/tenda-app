/**
 * The star row's ONE job is not to contradict the number printed beside it.
 * The comps' rule — two decimals, half from .25 — is what keeps 4.4 from
 * drawing as five stars, so every boundary of that rule is pinned here.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HALF_STAR_THRESHOLD, RatingStars, starFills } from '@/components/ui/RatingStars'

describe('starFills', () => {
  it('always returns exactly five', () => {
    for (const score of [0, 2.5, 4.99, 5]) expect(starFills(score)).toHaveLength(5)
  })

  it('fills whole stars up to the integer part', () => {
    expect(starFills(3)).toEqual(['whole', 'whole', 'whole', 'empty', 'empty'])
  })

  it('draws the half from .25 up, and NOT below it', () => {
    expect(starFills(4 + HALF_STAR_THRESHOLD)[4]).toBe('half')
    expect(starFills(4.24)[4]).toBe('empty')
    expect(starFills(4.7)[4]).toBe('half')
  })

  it('rounds to two decimals BEFORE splitting, so 4.999 is five whole stars', () => {
    // Rounding after the split would leave a fraction of 1.0, i.e. a half
    // star on top of four wholes — a 5.00 average drawn as 4.5.
    expect(starFills(4.999)).toEqual(['whole', 'whole', 'whole', 'whole', 'whole'])
  })

  it('clamps a score outside 0–5 rather than rendering more or fewer stars', () => {
    expect(starFills(-3)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty'])
    expect(starFills(9)).toEqual(['whole', 'whole', 'whole', 'whole', 'whole'])
  })
})

describe('RatingStars', () => {
  it('is ONE labelled image, not five glyphs announced separately', () => {
    render(<RatingStars score={4.5} />)
    const row = screen.getByRole('img', { name: '4.5 out of 5' })
    expect(row).toBeInTheDocument()
    // The glyphs themselves say nothing; the label is the fact.
    expect(row.querySelectorAll('svg')).toHaveLength(5)
    for (const glyph of row.querySelectorAll('svg')) {
      expect(glyph).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('shows the three fills as three different opacities, per both comps', () => {
    const { container } = render(<RatingStars score={1.5} />)
    const glyphs = [...container.querySelectorAll('svg')]
    expect(glyphs[0].getAttribute('class')).toContain('opacity-100')
    expect(glyphs[1].getAttribute('class')).toContain('opacity-[0.42]')
    expect(glyphs[2].getAttribute('class')).toContain('opacity-[0.22]')
  })
})
