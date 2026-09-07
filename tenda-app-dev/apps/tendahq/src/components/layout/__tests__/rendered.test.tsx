import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ThemeContext, type ResolvedTheme, type ThemeContextValue } from '@/theme/theme-context'
import { Navbar } from '../Navbar'
import { NAV_LABELS, NAV_LINKS, WEB_APP_LINK } from '../nav-content'

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
