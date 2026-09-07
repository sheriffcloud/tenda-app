/**
 * The landing's compact hero (#60, correction a): the three shared strings,
 * verbatim, and the two calls to action — and NONE of tendahq's hero
 * objects. A string typed here instead of read from APP_INFO is exactly the
 * drift `pitch-strings.test.ts` exists to catch, so every assertion goes
 * through the shared object.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { APP_INFO } from '@tenda/shared'
import { FEED_HERO_HREF, FeedHero } from '@/components/gig/feed/FeedHero'
import { FEED_COPY } from '@/components/gig/feed/copy'

describe('FeedHero', () => {
  it('states the tagline as the h1 (ending on the blue period), the description and the guarantee verbatim', () => {
    render(<FeedHero />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(APP_INFO.tagline)
    expect(heading.querySelector('.text-brand-primary')).toHaveTextContent('.')
    expect(screen.getByText(APP_INFO.description)).toBeInTheDocument()
    expect(screen.getByText(APP_INFO.guarantee)).toBeInTheDocument()
  })

  it('offers posting and the escrow explainer as its two links', () => {
    render(<FeedHero />)
    expect(screen.getByRole('link', { name: FEED_COPY.cta.post })).toHaveAttribute('href', FEED_HERO_HREF.post)
    expect(screen.getByRole('link', { name: FEED_COPY.cta.how })).toHaveAttribute('href', FEED_HERO_HREF.how)
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('carries no stamp, receipt or figure — the feed is this page’s object', () => {
    const { container } = render(<FeedHero />)
    expect(container.querySelector('[data-feed-hero]')).not.toBeNull()
    // Exactly one heading and the two paragraphs: nothing else is drawn.
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })
})
