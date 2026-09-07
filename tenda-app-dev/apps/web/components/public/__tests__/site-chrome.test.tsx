import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { APP_INFO, LOCATIONS, SUPPORTED_PAYOUT_COUNTRIES } from '@tenda/shared'
import { BrandMark, BrandTile } from '@/components/public/BrandMark'
import { SiteFooter } from '@/components/public/SiteFooter'
import { SiteHeader } from '@/components/public/SiteHeader'
import { marketNames, payoutMarketNames } from '@/lib/markets'

describe('payoutMarketNames', () => {
  it('names the payout registry, not the ten countries a gig may be posted in', () => {
    // Two different vocabularies; conflating them oversells the product in
    // the direction that costs someone a wasted signup.
    expect(payoutMarketNames()).toHaveLength(SUPPORTED_PAYOUT_COUNTRIES.length)
    expect(payoutMarketNames().length).toBeLessThan(Object.keys(LOCATIONS).length)
  })

  it('resolves each code to its name', () => {
    for (const name of payoutMarketNames()) {
      expect(name).not.toMatch(/^[A-Z]{2}$/)
    }
    expect(payoutMarketNames()).toContain('Nigeria')
  })

  it('shows an unknown code as-is rather than leaving a gap in the sentence', () => {
    // The two country registries are independent: a payout market added
    // without a location entry degrades, it does not vanish.
    expect(marketNames(['NG', 'ZZ'])).toEqual(['Nigeria', 'ZZ'])
    expect(marketNames([])).toEqual([])
  })
})

describe('BrandMark', () => {
  it('uses the official full logo asset', () => {
    const { container } = render(<BrandMark />)
    expect(screen.getByRole('img', { name: APP_INFO.name })).toHaveAttribute('src', '/logo_full_dark.png')
    expect(container.querySelector('[data-brand-dark]')).toHaveAttribute('src', '/logo_full.png')
  })

  it('uses the official compact asset on logo-only surfaces', () => {
    render(<BrandTile size={56} />)
    expect(screen.getByRole('img', { name: APP_INFO.name })).toHaveAttribute('src', '/logo_dark.png')
    expect(screen.queryByText(APP_INFO.name.charAt(0))).not.toBeInTheDocument()
  })

  it('goes to the feed by default and honours an override', () => {
    const { unmount } = render(<BrandMark />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/')
    unmount()

    render(<BrandMark href="/" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/')
  })
})

describe('SiteHeader', () => {
  it('offers the sections that exist', () => {
    render(<SiteHeader />)
    expect(screen.getByRole('link', { name: 'Browse gigs' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', '/support')
  })

  it('links to no page that does not exist yet', () => {
    // The comp also lists "Foundations"; a nav pointing at a 404 is worse
    // than a nav that waits for the page.
    render(<SiteHeader />)
    expect(screen.queryByRole('link', { name: /foundations/i })).not.toBeInTheDocument()
  })

  it('carries the way in', () => {
    render(<SiteHeader />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin')
  })

  it('drops only the link that duplicates the wordmark on a narrow row', () => {
    // The row cannot wrap and nothing in it shrinks, so at 360px it pushed the
    // sign-in button off-screen and scrolled the whole document sideways
    // (measured). The link to lose is the one whose destination is already on
    // screen — never Support, and never the way in. The e2e suite measures the
    // overflow itself; this pins WHICH link the rule picks.
    render(<SiteHeader />)
    const brandLinks = screen.getAllByRole('link', { name: /Tenda/ })
    expect(brandLinks).toHaveLength(2)
    const brandHref = brandLinks[0].getAttribute('href')
    const browse = screen.getByRole('link', { name: 'Browse gigs' })
    expect(browse).toHaveAttribute('href', brandHref)
    expect(browse.className).toContain('hidden')
    expect(browse.className).toContain('sm:block')

    for (const name of ['Support', 'Sign in']) {
      expect(screen.getByRole('link', { name }).className).not.toContain('hidden')
    }
  })
})

describe('SiteFooter', () => {
  it('states the product from shared APP_INFO, never inline strings', () => {
    render(<SiteFooter />)
    expect(screen.getByRole('img', { name: APP_INFO.name })).toHaveAttribute('src', '/logo_full_dark.png')
    expect(screen.getByText(new RegExp(APP_INFO.tagline))).toBeInTheDocument()
  })

  it('links only to support pages that exist', () => {
    render(<SiteFooter />)
    const guides = within(screen.getByRole('navigation', { name: 'Guides' }))
    expect(guides.getByRole('link', { name: 'How escrow works' })).toHaveAttribute(
      'href',
      '/support/escrow',
    )
    // The comp's "404 example" is a prototype affordance, not a page.
    expect(screen.queryByRole('link', { name: /404/ })).not.toBeInTheDocument()
  })

  it('takes its legal links from shared APP_INFO', () => {
    render(<SiteFooter />)
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      APP_INFO.legal.terms,
    )
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      APP_INFO.legal.privacy,
    )
  })
})
