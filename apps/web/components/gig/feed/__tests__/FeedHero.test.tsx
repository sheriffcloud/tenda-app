/**
 * The landing's compact hero (#60, correction a): the three shared strings,
 * verbatim, and the two calls to action — and NONE of tendahq's hero
 * objects. A string typed here instead of read from APP_INFO is exactly the
 * drift `pitch-strings.test.ts` exists to catch, so every assertion goes
 * through the shared object.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { APP_INFO, GUARANTEE_WITHOUT_HOURS, guaranteeAfter } from '@tenda/shared'
import { FEED_HERO_HREF, FeedHero } from '@/components/gig/feed/FeedHero'
import { FEED_COPY } from '@/components/gig/feed/copy'

describe('FeedHero', () => {
  it('states the tagline as the h1 (ending on the blue period), the description and the guarantee verbatim', () => {
    render(<FeedHero approvalWindows={[]} />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(APP_INFO.tagline)
    expect(heading.querySelector('.text-brand-primary')).toHaveTextContent('.')
    expect(screen.getByText(APP_INFO.description)).toBeInTheDocument()
    expect(screen.getByText(APP_INFO.guarantee)).toBeInTheDocument()
  })

  it('names the hours only from the registry, and only when every served chain agrees (#148)', () => {
    // The review window is a contract value per chain: a deployment serving
    // one 24h chain promises 24 hours; one serving a 24h and a 48h chain has
    // no number to promise; a registry that failed to load promises the right
    // without a count — never a static 48.
    const { rerender } = render(<FeedHero approvalWindows={[86_400]} />)
    expect(screen.getByText(guaranteeAfter(24))).toBeInTheDocument()
    rerender(<FeedHero approvalWindows={[86_400, 172_800]} />)
    expect(screen.getByText(GUARANTEE_WITHOUT_HOURS)).toBeInTheDocument()
    expect(screen.queryByText(/\d+ hours/)).toBeNull()
    rerender(<FeedHero approvalWindows={[]} />)
    expect(screen.getByText(GUARANTEE_WITHOUT_HOURS)).toBeInTheDocument()
  })

  it('offers posting and the escrow explainer as its two links', () => {
    render(<FeedHero approvalWindows={[]} />)
    expect(screen.getByRole('link', { name: FEED_COPY.cta.post })).toHaveAttribute('href', FEED_HERO_HREF.post)
    expect(screen.getByRole('link', { name: FEED_COPY.cta.how })).toHaveAttribute('href', FEED_HERO_HREF.how)
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('carries no stamp, receipt or figure — the feed is this page’s object', () => {
    const { container } = render(<FeedHero approvalWindows={[]} />)
    expect(container.querySelector('[data-feed-hero]')).not.toBeNull()
    // Exactly one heading and the two paragraphs: nothing else is drawn.
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })
})
