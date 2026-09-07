/**
 * The feed's list half (#60): the heading with the live facts, the view
 * toggle switching the cards' density, and each fact omitted — never
 * invented — when its read failed.
 */
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chainLabel } from '@tenda/shared'
import { toGigCardModel } from '@/components/gig/feed/gig-card-model'
import { NO_FACTS, PublicGigFeedSurface, type FeedFacts } from '@/components/gig/feed/PublicGigFeedSurface'
import { FEED_COPY } from '@/components/gig/feed/copy'
import { OPEN_GIGS_COPY } from '@/components/gigs/copy'
import { resetGigsViewForTests, setGigsView } from '@/lib/gigs/browse-view'
import { parseGigFeedFilters, toGigListQuery } from '@/lib/gigs/search-params'
import { deliveryGig, photoGig } from '@/e2e/fixtures/gigs'

vi.mock('@/hooks/gig/usePublicGigFeedRealtime', () => ({ usePublicGigFeedRealtime: vi.fn() }))

import { usePublicGigFeedRealtime } from '@/hooks/gig/usePublicGigFeedRealtime'

const CHAINS = ['solana:devnet', 'eip155:84532']
const filters = parseGigFeedFilters({}, new Set(CHAINS))
const query = toGigListQuery(filters)
const page = {
  data: [toGigCardModel(deliveryGig), toGigCardModel(photoGig)],
  total: 33,
  limit: 20,
  offset: 0,
  next_cursor: null,
}

/** Both fixture cards, by their real titles — never a title a fixture no longer carries. */
const CARD_NAMES = new RegExp(`${deliveryGig.title}|${photoGig.title}`)

const renderSurface = (facts: FeedFacts = { chainIds: CHAINS, markets: 6, feeBps: 250 }) =>
  render(<PublicGigFeedSurface page={page} filters={filters} query={query} facts={facts} />)

beforeEach(() => {
  window.localStorage.clear()
  resetGigsViewForTests()
})

describe('PublicGigFeedSurface', () => {
  it('heads the list with the count and the LIVE facts: chains as glyph discs, markets, fee, the keyboard walk', () => {
    renderSurface()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(`${FEED_COPY.feed.heading}.`)
    const facts = document.querySelector('[data-feed-facts]')
    expect(facts).toHaveTextContent(FEED_COPY.feed.count(33))
    expect(facts).toHaveTextContent(FEED_COPY.feed.chains(2))
    expect(facts).toHaveTextContent(FEED_COPY.feed.markets(6))
    expect(facts).toHaveTextContent('2.5% fee')
    expect(within(facts as HTMLElement).getByRole('img', { name: chainLabel('solana:devnet') })).toBeInTheDocument()
    expect(within(facts as HTMLElement).getByRole('img', { name: chainLabel('eip155:84532') })).toBeInTheDocument()
    expect(facts).toHaveTextContent(`${FEED_COPY.feed.keyboardHint.walk} · ↵ ${FEED_COPY.feed.keyboardHint.open}`)
  })

  it('says "1 chain" and "1 market" in the singular', () => {
    renderSurface({ chainIds: ['solana:devnet'], markets: 1, feeBps: 100 })
    const facts = document.querySelector('[data-feed-facts]')
    expect(facts).toHaveTextContent('1 chain')
    expect(facts).not.toHaveTextContent('1 chains')
    expect(facts).toHaveTextContent('1 market')
    expect(facts).toHaveTextContent('1% fee')
  })

  it('applies a live frame the realtime hook hands it, moving the count with the rows and never below zero', () => {
    renderSurface()
    const call = vi.mocked(usePublicGigFeedRealtime).mock.calls.at(-1)?.[0]
    expect(call).toBeDefined()
    act(() => {
      call?.applyItems([toGigCardModel(deliveryGig)], -1)
    })
    expect(document.querySelector('[data-feed-facts]')).toHaveTextContent(FEED_COPY.feed.count(32))
    expect(screen.getAllByRole('link', { name: CARD_NAMES })).toHaveLength(1)
    expect(screen.getByRole('link', { name: new RegExp(deliveryGig.title) })).toBeInTheDocument()
    // A removal past the total floors at zero rather than printing a negative.
    act(() => {
      vi.mocked(usePublicGigFeedRealtime).mock.calls.at(-1)?.[0].applyItems([], -40)
    })
    expect(document.querySelector('[data-feed-facts]')).toHaveTextContent(FEED_COPY.feed.count(0))
  })

  it('OMITS a fact whose read failed, rather than inventing one', () => {
    renderSurface(NO_FACTS)
    const facts = document.querySelector('[data-feed-facts]')
    expect(facts).toHaveTextContent(FEED_COPY.feed.count(33))
    expect(facts).not.toHaveTextContent(/chain/)
    expect(facts).not.toHaveTextContent(/market/)
    expect(facts).not.toHaveTextContent(/fee/)
    expect(facts).toHaveTextContent(FEED_COPY.feed.keyboardHint.walk)
  })

  it('draws the list density by default and the grid density once the toggle is pressed — the same cards', async () => {
    renderSurface()
    const list = screen.getByRole('list')
    expect(list).toHaveAttribute('data-view', 'list')
    // The CONTAINER changes geometry with the density: a ruled column of rows,
    // then a card grid — `feedListClass`, shared with the skeleton.
    expect(list.className).toContain('flex-col')
    expect(list.className).not.toContain('grid-cols-')
    const cards = screen.getAllByRole('link', { name: CARD_NAMES })
    expect(cards).toHaveLength(2)
    for (const card of cards) {
      expect(card).toHaveAttribute('data-gig-density', 'row')
    }
    await userEvent.click(screen.getByRole('button', { name: OPEN_GIGS_COPY.view.grid }))
    expect(screen.getByRole('list')).toHaveAttribute('data-view', 'grid')
    expect(screen.getByRole('list').className).toContain('grid-cols-')
    expect(screen.getByRole('link', { name: new RegExp(deliveryGig.title) })).toHaveAttribute('data-gig-density', 'grid')
    // Every card still points at the PUBLIC listing.
    expect(screen.getByRole('link', { name: new RegExp(deliveryGig.title) })).toHaveAttribute('href', `/gig/${deliveryGig.escrow_id}`)
  })

  it('follows the preference set elsewhere — the same choice /gigs remembers', () => {
    renderSurface()
    act(() => {
      setGigsView('grid')
    })
    expect(screen.getByRole('list')).toHaveAttribute('data-view', 'grid')
  })

  it('names a searched view "Search results", still ending on the period', () => {
    const searched = parseGigFeedFilters({ q: 'parcel' }, new Set(CHAINS))
    render(<PublicGigFeedSurface page={page} filters={searched} query={toGigListQuery(searched)} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(`${FEED_COPY.feed.searchHeading}.`)
  })

  it('tells a reader past the last page so, and one with an empty feed so — two different situations', () => {
    const empty = { ...page, data: [] }
    const { unmount } = render(<PublicGigFeedSurface page={{ ...empty, total: 33 }} filters={filters} query={query} />)
    expect(screen.getByText(FEED_COPY.pastEnd.title)).toBeInTheDocument()
    expect(screen.queryByText(FEED_COPY.empty.bareTitle)).toBeNull()
    unmount()
    render(<PublicGigFeedSurface page={{ ...empty, total: 0 }} filters={filters} query={query} />)
    expect(screen.getByText(FEED_COPY.empty.bareTitle)).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('states the amount note under the heading', () => {
    renderSurface()
    expect(screen.getByText(FEED_COPY.feed.amountNote)).toBeInTheDocument()
  })
})
