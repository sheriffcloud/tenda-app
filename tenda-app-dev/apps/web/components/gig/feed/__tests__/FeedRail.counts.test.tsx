/**
 * The rail's facet counts.
 *
 * The count is the ONLY part of a rail cell that makes a claim about data
 * rather than about navigation, so the two states that matter are "we know"
 * and "we do not know" — and the second must not be rendered as zero.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CATEGORY_LABELS, GIG_CATEGORIES, LOCATIONS, type GigFacets } from '@tenda/shared'
import { FeedRail } from '@/components/gig/feed/FeedRail'
import { FEED_COPY } from '@/components/gig/feed/copy'
import { parseGigFeedFilters, type RawSearchParams } from '@/lib/gigs/search-params'

const CHAINS = [{ id: 'solana:devnet', label: 'Solana Devnet' }]
const ENABLED = new Set(CHAINS.map((c) => c.id))

/**
 * Built from the shared vocabulary rather than typed out: the wire map is
 * COMPLETE over every served market, and a hand-written literal would stop
 * compiling the day a market is added — which is the fixture drifting, not the
 * rail breaking.
 */
const markets = (counts: Partial<GigFacets['country']>): GigFacets['country'] => ({
  ...(Object.fromEntries(Object.keys(LOCATIONS).map((code) => [code, 0])) as GigFacets['country']),
  ...counts,
})

const FACETS: GigFacets = {
  category: { delivery: 7, photo: 0, errand: 3, service: 12, digital: 1 },
  country: markets({ NG: 9, GH: 2, KE: 1 }),
  remote: 5,
  cross_border: 2,
}

const renderRail = (facets: GigFacets | null, params: RawSearchParams = {}) =>
  render(
    <FeedRail filters={parseGigFeedFilters(params, ENABLED)} chains={CHAINS} facets={facets} />,
  )

/** The cell's own count, read from inside its link so a neighbour cannot answer for it. */
const countIn = (name: string): string | null =>
  screen.getByRole('link', { name: new RegExp(`^${name}`) }).textContent?.replace(name, '') ?? null

describe('FeedRail counts', () => {
  it('puts each category count on its own row', () => {
    renderRail(FACETS)
    for (const category of GIG_CATEGORIES) {
      const label = CATEGORY_LABELS[category]
      expect(countIn(label)).toBe(String(FACETS.category[category]))
    }
  })

  it('renders a real ZERO — an empty category is a fact, not a missing number', () => {
    renderRail(FACETS)
    // 'photo' has no gigs. Omitting the number here would read as "still
    // loading" on a page that has already finished rendering.
    expect(countIn(CATEGORY_LABELS.photo)).toBe('0')
  })

  it('counts both arrangement toggles', () => {
    renderRail(FACETS)
    expect(countIn(FEED_COPY.rail.remote)).toBe('5')
    expect(countIn(FEED_COPY.rail.crossBorder)).toBe('2')
  })

  it('omits every count when the read FAILED, rather than claiming zero', () => {
    renderRail(null)
    for (const label of [CATEGORY_LABELS.delivery, FEED_COPY.rail.remote]) {
      expect(countIn(label)).toBe('')
    }
    // …and the rail still works: the counts are an enhancement, not the rail.
    expect(screen.getByRole('link', { name: CATEGORY_LABELS.delivery })).toHaveAttribute(
      'href',
      '/?category=delivery',
    )
  })

  it('defaults to no counts when the prop is absent entirely', () => {
    render(<FeedRail filters={parseGigFeedFilters({}, ENABLED)} chains={CHAINS} />)
    expect(countIn(CATEGORY_LABELS.delivery)).toBe('')
  })

  it('keeps counts on the cells while one of them is ACTIVE', () => {
    // The drilldown case: standing on 'photo', the other categories must still
    // show what they lead to. A count that collapsed to 0 here would tell the
    // reader the rest of the feed is empty.
    renderRail(FACETS, { category: 'photo' })
    expect(countIn(CATEGORY_LABELS.service)).toBe('12')
    expect(screen.getByRole('link', { name: /^Creative/ })).toHaveAttribute('aria-current', 'true')
  })

  it('leaves the market chips uncounted, as the comp draws them', () => {
    renderRail(FACETS)
    const market = screen.getByRole('group', { name: FEED_COPY.rail.market })
    // The endpoint answers per-country; the chip has no slot for it, and
    // inventing one would be comp drift.
    expect(within(market).getByRole('link', { name: 'Nigeria' }).textContent).toBe('Nigeria')
  })
})

describe('FeedRail count accessibility', () => {
  it('announces what the number COUNTS, not a bare digit', () => {
    renderRail(FACETS)
    // "Delivery 7" tells a screen-reader user nothing about the 7. The visible
    // pixels stay a numeral; the accessible name carries the unit.
    expect(
      screen.getByRole('link', { name: `${CATEGORY_LABELS.delivery} 7 gigs` }),
    ).toBeInTheDocument()
  })

  it('says "1 gig", not "1 gigs" — the shared feed pluralisation', () => {
    renderRail(FACETS)
    expect(
      screen.getByRole('link', { name: `${CATEGORY_LABELS.digital} 1 gig` }),
    ).toBeInTheDocument()
  })
})
