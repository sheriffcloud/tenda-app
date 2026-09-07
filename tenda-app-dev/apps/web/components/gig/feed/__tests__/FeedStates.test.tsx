import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  FeedEmpty,
  FeedError,
  FeedErrorStatic,
  FeedPastEnd,
  FeedSkeleton,
} from '@/components/gig/feed/FeedStates'
import { FeedPager } from '@/components/gig/feed/FeedPager'
import { FEED_COPY } from '@/components/gig/feed/copy'
import {
  GIGS_PAGE_SIZE,
  gigsHref,
  parseGigFeedFilters,
  type RawSearchParams,
} from '@/lib/gigs/search-params'

const filters = (params: RawSearchParams = {}) => parseGigFeedFilters(params, new Set())

describe('FeedSkeleton', () => {
  it('is hidden from assistive tech — it has nothing to say', () => {
    const { container } = render(<FeedSkeleton count={3} />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden')
  })

  it('never draws more placeholders than a page can hold', () => {
    const { container } = render(<FeedSkeleton count={999} />)
    expect(container.firstElementChild?.children).toHaveLength(GIGS_PAGE_SIZE)
  })
})

describe('FeedEmpty', () => {
  it('blames the filters and offers to clear them, when there ARE filters', () => {
    render(<FeedEmpty filtered />)
    expect(screen.getByText(FEED_COPY.empty.title)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: FEED_COPY.empty.action })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('says something TRUE when nothing is filtered, and offers no dead button', () => {
    // "Widen your filters" is useless advice to someone who set none, and
    // Clear would link to the page they are already on.
    render(<FeedEmpty filtered={false} />)
    expect(screen.getByText(FEED_COPY.empty.bareTitle)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: FEED_COPY.empty.action })).not.toBeInTheDocument()
  })
})

describe('FeedPastEnd', () => {
  it('does NOT claim the filters matched nothing when they matched something', () => {
    // The state this replaces: a stale page-three link lands on an empty page
    // while `total` still reports twenty matches, and FeedEmpty told the
    // reader "no gigs match these filters" about a query that plainly did.
    render(<FeedPastEnd href="/?q=tiler" total={20} />)
    expect(screen.queryByText(FEED_COPY.empty.title)).not.toBeInTheDocument()
    expect(screen.getByText(FEED_COPY.pastEnd.title)).toBeInTheDocument()
    expect(screen.getByText(FEED_COPY.pastEnd.body(20))).toBeInTheDocument()
  })

  it('rewinds the POSITION and keeps the search, rather than clearing everything', () => {
    render(<FeedPastEnd href="/?q=tiler" total={20} />)
    expect(screen.getByRole('link', { name: FEED_COPY.pastEnd.action })).toHaveAttribute(
      'href',
      '/?q=tiler',
    )
  })

  it('counts one match as one gig', () => {
    render(<FeedPastEnd href="/?q=tiler" total={1} />)
    expect(screen.getByText(/\b1 gig\b/)).toBeInTheDocument()
  })

  it('does not claim a search the reader never made', () => {
    // The bare recency feed reaches this too, via a spent cursor — so the copy
    // has to be true with no filters set at all.
    render(<FeedPastEnd href="/" total={20} />)
    const body = screen.getByText(FEED_COPY.pastEnd.body(20))
    expect(body.textContent).not.toMatch(/\bthis search\b/i)
    expect(body.textContent).not.toMatch(/your filters are\b/i)
  })
})

describe('the page rewinds to the same query, both paging modes', () => {
  it('drops a spent cursor AND a stale offset while keeping every filter', () => {
    // This is the href the page hands FeedPastEnd. It has to work for the
    // cursor feed (anchor row taken) and the offset feed (page past the end).
    const stale = filters({ q: 'tiler', category: 'photo', cursor: 'spent', offset: '80' })
    expect(gigsHref(stale)).toBe('/?category=photo&q=tiler')
  })
})

describe('FeedError', () => {
  it('announces itself and says the money is untouched', () => {
    render(<FeedError retry={vi.fn()} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(FEED_COPY.error.body)).toBeInTheDocument()
  })

  it('retries the failed render rather than linking to the same page', () => {
    const retry = vi.fn()
    render(<FeedError retry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: FEED_COPY.error.action }))
    expect(retry).toHaveBeenCalledOnce()
  })
})

describe('FeedErrorStatic — the server-rendered twin', () => {
  it('says the same thing, with no JavaScript needed to say it', () => {
    // `error.tsx` is a client component, so its fallback arrives with the
    // hydration script: a failed read rendered a completely BLANK page with
    // JavaScript off — measured — on the surface whose whole premise is that
    // it works without the bundle, at the moment a reader most needs telling
    // that their escrow is untouched.
    render(<FeedErrorStatic href="/?q=tiler" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(FEED_COPY.error.body)).toBeInTheDocument()
  })

  it('retries through a plain LINK, keeping the reader on their own view', () => {
    // A fresh GET is a real retry server-side, and it carries the filters —
    // which a bare link to /gigs would drop.
    render(<FeedErrorStatic href="/?q=tiler" />)
    const action = screen.getByRole('link', { name: new RegExp(FEED_COPY.error.action) })
    expect(action).toHaveAttribute('href', '/?q=tiler')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('and the boundary twin still uses a callback, not a link', () => {
    render(<FeedError retry={vi.fn()} />)
    expect(screen.getByRole('button', { name: FEED_COPY.error.action })).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('FEED_COPY.feed.count', () => {
  it('agrees with itself about one', () => {
    expect(FEED_COPY.feed.count(1)).toBe('1 gig')
    expect(FEED_COPY.feed.count(0)).toBe('0 gigs')
    expect(FEED_COPY.feed.count(42)).toBe('42 gigs')
  })
})

describe('FeedPager — cursor mode (the plain recency feed)', () => {
  it('follows the server-minted cursor', () => {
    render(<FeedPager filters={filters()} nextCursor="abc" total={99} shown={20} />)
    expect(screen.getByRole('link', { name: /More gigs/ })).toHaveAttribute(
      'href',
      '/?cursor=abc',
    )
  })

  it('renders nothing on the last page', () => {
    const { container } = render(
      <FeedPager filters={filters()} nextCursor={null} total={5} shown={5} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the response carried no cursor field at all', () => {
    const { container } = render(<FeedPager filters={filters()} total={5} shown={5} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('FeedPager — offset mode (searched or sorted)', () => {
  it('pages a SEARCHED feed, which the server mints no cursor for', () => {
    // Before this, searching capped the feed at its first twenty rows with no
    // way forward and no sign that more existed.
    render(<FeedPager filters={filters({ q: 'tiler' })} total={44} shown={20} />)
    const next = screen.getByRole('link', { name: /More gigs/ })
    expect(next.getAttribute('href')).toContain(`offset=${GIGS_PAGE_SIZE}`)
    expect(next.getAttribute('href')).toContain('q=tiler')
  })

  it('pages a SORTED feed too', () => {
    render(<FeedPager filters={filters({ sort: 'amount_desc' })} total={44} shown={20} />)
    expect(screen.getByRole('link', { name: /More gigs/ }).getAttribute('href')).toContain(
      'sort=amount_desc',
    )
  })

  it('offers a way back, and never to a negative offset', () => {
    render(<FeedPager filters={filters({ q: 'x', offset: '10' })} total={44} shown={20} />)
    expect(screen.getByRole('link', { name: /Previous/ }).getAttribute('href')).toContain(
      'offset=0',
    )
  })

  it('stops at the end even when the last page is exactly full', () => {
    // A full page is not evidence of a next one — `total` is.
    render(<FeedPager filters={filters({ q: 'x', offset: '20' })} total={40} shown={20} />)
    expect(screen.queryByRole('link', { name: /More gigs/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Previous/ })).toBeInTheDocument()
  })

  it('says where the reader is', () => {
    render(<FeedPager filters={filters({ q: 'x', offset: '20' })} total={44} shown={20} />)
    expect(screen.getByText(FEED_COPY.pager.position(2, 3))).toBeInTheDocument()
  })

  it('renders nothing when one page holds everything', () => {
    const { container } = render(<FeedPager filters={filters({ q: 'x' })} total={4} shown={4} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('never sends a cursor into offset mode — that pairing is a 400', () => {
    render(
      <FeedPager filters={filters({ q: 'x', cursor: 'abc' })} nextCursor="abc" total={44} shown={20} />,
    )
    expect(screen.getByRole('link', { name: /More gigs/ }).getAttribute('href')).not.toContain(
      'cursor',
    )
  })
})
