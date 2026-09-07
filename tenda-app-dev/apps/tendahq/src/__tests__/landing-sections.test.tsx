import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LandingPage } from '../App'
import { LANDING_SECTIONS, sectionSurface } from '@/components/sections/landing-sections'
import { renderedSections } from '@/test-support/rendered-sections'

/**
 * #55: a section's surface is a fact about its POSITION, so the page derives it
 * and hands it down. Three things have to hold for that to be worth anything,
 * and only one of them is checkable by the type system (none of them, in fact —
 * see below).
 */
describe('sectionSurface', () => {
  /**
   * Checked past the end of the current page on purpose: the rule has to hold
   * for the sections that do not exist yet, since making insertion free is the
   * whole point.
   */
  it('alternates from base, so no two neighbours can share a surface', () => {
    const surfaces = Array.from({ length: LANDING_SECTIONS.length + 2 }, (_, i) => sectionSurface(i))
    // Base first because the hero opens the page on the plain ground the navbar
    // sits over; starting on alt would tint the first screen.
    expect(surfaces[0]).toBe('base')
    for (let i = 1; i < surfaces.length; i += 1) {
      expect(surfaces[i]).not.toBe(surfaces[i - 1])
    }
  })
})

describe('LANDING_SECTIONS', () => {
  it('gives every entry a distinct key', () => {
    // The key is React's identity for the row and the name a failure prints;
    // a duplicate from copy-pasting an entry would quietly break both.
    const keys = LANDING_SECTIONS.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  /**
   * The gap TypeScript cannot close. A component declaring NO props is still
   * assignable to `ComponentType<LandingSectionProps>`, so a section that
   * ignores the prop and hardcodes its own surface type-checks perfectly — and
   * would silently opt out of the rhythm the moment anything above it moved.
   * Each entry is therefore rendered at BOTH surfaces and the markup read back.
   */
  for (const { key, Section } of LANDING_SECTIONS) {
    it(`${key} renders the surface it is given, not one of its own`, () => {
      const base = renderedSections(renderToStaticMarkup(<Section surface="base" />))
      const alt = renderedSections(renderToStaticMarkup(<Section surface="alt" />))
      // Exactly one surfaced <section> per entry: a section rendering two (or
      // none) would put the page's count out of step with the array's.
      expect(base).toHaveLength(1)
      expect(alt).toHaveLength(1)
      expect(base[0].surface).toBe('base')
      expect(alt[0].surface).toBe('alt')
    })
  }

  it('reaches the page: every section renders the surface its position derives', () => {
    // The left side is what the DOM actually received, the right side is the
    // rule. Equal only if the derivation is wired through all ten components —
    // which is what makes the per-entry tests above add up to a page.
    const rendered = renderedSections(renderToStaticMarkup(<LandingPage />))
    expect(rendered.map((s) => s.surface)).toEqual(
      LANDING_SECTIONS.map((_, index) => sectionSurface(index)),
    )
  })
})
