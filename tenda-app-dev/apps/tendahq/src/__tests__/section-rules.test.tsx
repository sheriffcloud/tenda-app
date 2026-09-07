import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LandingPage } from '../App'
import { LANDING_SECTIONS } from '@/components/sections/landing-sections'

/**
 * A whole-page typographic rule no single section can check about itself.
 */
const html = renderToStaticMarkup(<LandingPage />)

describe('section rules', () => {
  it('carries no section numbering — a number is a hand-kept fact about position', () => {
    expect(html).not.toMatch(/§\s?\d/)
    expect(LANDING_SECTIONS.length).toBeGreaterThan(1)
  })

  it('ends every headline on the brand period, not on an ink one', () => {
    // The wordmark's own move: the period is the one blue thing in running
    // type. A headline ending on a plain full stop has fallen off the rule.
    const headlines = [...html.matchAll(/<h[12][^>]*>(.*?)<\/h[12]>/g)].map((m) => m[1])
    expect(headlines.length).toBeGreaterThan(5)
    for (const h of headlines) {
      const text = h.replace(/<[^>]+>/g, '')
      if (text.endsWith('.')) expect(h).toContain('text-[var(--brand-primary)]">.</span>')
    }
  })
})
