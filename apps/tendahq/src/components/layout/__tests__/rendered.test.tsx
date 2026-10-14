import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ThemeContext, type ResolvedTheme, type ThemeContextValue } from '@/theme/theme-context'
import { Navbar } from '../Navbar'
import { DOCS_LINK, NAV_LABELS, NAV_LINKS, WEB_APP_LINK } from '../nav-content'

/**
 * The bar and its sheet make two accessibility claims the page depends on:
 * the closed sheet is out of the tab order, and the theme switch says which
 * way it is set. Neither is visible in a screenshot.
 */
const theme = (resolved: ResolvedTheme): ThemeContextValue => ({
  mode: resolved,
  resolved,
  setMode: () => undefined,
  toggle: () => undefined,
})

const render = (resolved: ResolvedTheme) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ThemeContext.Provider value={theme(resolved)}>
        <Navbar />
      </ThemeContext.Provider>
    </MemoryRouter>,
  )

const count = (html: string, needle: string) => html.split(needle).length - 1

describe('the navbar', () => {
  it('renders every section link twice — once in the bar, once in the sheet', () => {
    const html = render('light')
    for (const link of NAV_LINKS) {
      expect(count(html, `href="${link.href}"`)).toBe(2)
      expect(count(html, `>${link.label}<`)).toBe(2)
    }
    expect(count(html, `href="${WEB_APP_LINK.href}"`)).toBe(2)
  })

  it('promotes the Agent API in BOTH layouts, and as an outline beside the APK', () => {
    // The reference is the product's differentiator, so it has to be reachable
    // from the bar on a desktop AND from the sheet on a phone — the footer
    // alone was the status quo this replaces. Twice, like every other pair.
    const html = render('light')
    expect(count(html, `href="${DOCS_LINK.href}"`)).toBe(2)
    expect(count(html, `>${DOCS_LINK.label}<`)).toBe(2)
  })

  it('keeps ONE filled button on the page — the web app, not the docs', () => {
    // The bar now carries three controls. If the Agent API ever became a
    // second primary the page would have two competing CTAs and the way IN
    // would stop being obvious.
    //
    // Asserted against the class the FILLED variant actually emits
    // (`bg-[var(--brand-solid)]`, Button.tsx VARIANTS.primary), not a
    // `variant-primary` attribute — no such attribute is rendered, so a test
    // spelled that way passes whatever the variant is.
    const html = render('light')
    const FILLED = 'bg-[var(--brand-solid)]'
    const tagAt = (href: string) => {
      const start = html.indexOf(`href="${href}"`)
      return html.slice(html.lastIndexOf('<', start), html.indexOf('>', start))
    }
    expect(tagAt(WEB_APP_LINK.href)).toContain(FILLED)
    expect(tagAt(DOCS_LINK.href)).not.toContain(FILLED)
    // …and exactly one filled control exists across the whole bar + sheet:
    // two renders of the same web-app button, and nothing else.
    expect(count(html, FILLED)).toBe(2)
  })

  it('keeps the closed sheet out of the accessibility tree and the tab order', () => {
    // Five focusable links and two buttons sit inside a sheet the visitor
    // cannot see. Without `inert`, Tab walks straight into them.
    const html = render('light')
    expect(html).toContain('id="mobile-nav" aria-hidden="true" inert=""')
    expect(html).toContain(`aria-label="${NAV_LABELS.toggleMenu}" aria-expanded="false" aria-controls="mobile-nav"`)
  })

  it('reports the theme switch as pressed only when the page is dark', () => {
    for (const resolved of ['light', 'dark'] as const) {
      const html = render(resolved)
      const pressed = resolved === 'dark'
      expect(count(html, `aria-label="${NAV_LABELS.toggleTheme}" aria-pressed="${pressed}"`)).toBe(2)
      expect(count(html, `aria-label="${NAV_LABELS.toggleTheme}" aria-pressed="${!pressed}"`)).toBe(0)
    }
  })
})
