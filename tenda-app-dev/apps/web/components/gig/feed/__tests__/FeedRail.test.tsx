import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CATEGORY_LABELS, GIG_CATEGORIES, LOCATIONS } from '@tenda/shared'
import { FeedRail } from '@/components/gig/feed/FeedRail'
import { FEED_COPY } from '@/components/gig/feed/copy'
import { CATEGORY_TONE } from '@/components/gig/category-icons'
import {
  GIG_SORT_LABELS,
  parseGigFeedFilters,
  type RawSearchParams,
} from '@/lib/gigs/search-params'

const mockPush = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

const CHAINS = [
  { id: 'solana:devnet', label: 'Solana Devnet' },
  { id: 'eip155:84532', label: 'Base Sepolia' },
]
const ENABLED = new Set(CHAINS.map((c) => c.id))
const filtersFrom = (params: RawSearchParams = {}) => parseGigFeedFilters(params, ENABLED)

const renderRail = (params: RawSearchParams = {}, chains = CHAINS) =>
  render(<FeedRail filters={filtersFrom(params)} chains={chains} />)

describe('FeedRail', () => {
  it('offers every category in the shared vocabulary, plus an "all" escape', () => {
    renderRail()
    for (const category of GIG_CATEGORIES) {
      expect(screen.getByRole('link', { name: CATEGORY_LABELS[category] })).toBeInTheDocument()
    }
    expect(
      screen.getByRole('link', { name: FEED_COPY.rail.allCategories }),
    ).toHaveAttribute('href', '/')
  })

  it('every control is a LINK or a form field — the rail works with no JavaScript', () => {
    renderRail()
    // A button here would be a filter that only exists once the bundle runs.
    for (const label of [CATEGORY_LABELS.photo, LOCATIONS.NG.name, FEED_COPY.rail.remote]) {
      expect(screen.getByText(label).closest('a')).not.toBeNull()
    }
  })

  it('marks the active filter as CURRENT, the attribute for a link', () => {
    renderRail({ category: 'photo' })
    const active = screen.getByRole('link', { name: CATEGORY_LABELS.photo })
    expect(active).toHaveAttribute('aria-current', 'true')
    // aria-pressed would describe a toggle button, which this is not.
    expect(active).not.toHaveAttribute('aria-pressed')
    expect(screen.getByRole('link', { name: CATEGORY_LABELS.errand })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('carries the other filters through a category change, so one click narrows once', () => {
    renderRail({ country: 'NG', remote: 'true' })
    const href = screen.getByRole('link', { name: CATEGORY_LABELS.photo }).getAttribute('href')
    expect(href).toContain('category=photo')
    expect(href).toContain('country=NG')
    expect(href).toContain('remote=true')
  })

  it('arrangement links TOGGLE — a second click clears the filter', () => {
    const { unmount } = renderRail()
    expect(screen.getByRole('link', { name: FEED_COPY.rail.remote }).getAttribute('href')).toContain(
      'remote=true',
    )
    unmount()

    renderRail({ remote: 'true' })
    expect(screen.getByRole('link', { name: FEED_COPY.rail.remote }).getAttribute('href')).toBe(
      '/',
    )
  })

  it('tints each category dot with its own tone', () => {
    const { container } = renderRail()
    const dot = container.querySelector(`.${CSS.escape(CATEGORY_TONE.digital.dot)}`)
    expect(dot).not.toBeNull()
  })

  it('offers only the chains this deployment serves', () => {
    renderRail()
    expect(screen.getByRole('link', { name: 'Base Sepolia' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /mainnet/i })).not.toBeInTheDocument()
  })

  it('hides the chain section entirely when the registry is empty', () => {
    // An unserved chain_id is a 400, so offering one would turn a click into
    // an error page.
    renderRail({}, [])
    expect(screen.queryByText(FEED_COPY.rail.chain)).not.toBeInTheDocument()
  })

  it('offers every sort the URL contract accepts as a LINK, and nothing it does not', () => {
    // Rows since #60, like every other section — each ordering is a URL.
    renderRail()
    const sort = screen.getByRole('group', { name: FEED_COPY.rail.sort })
    const labels = within(sort).getAllByRole('link').map((link) => link.textContent)
    expect(labels).toEqual(Object.values(GIG_SORT_LABELS))
    // The comp offers a fourth, "Accept deadline", that no sort value backs.
    expect(labels).not.toContain('Accept deadline')
  })

  it('links the DEFAULT ordering to the bare view, keeping the canonical URL', () => {
    renderRail({ category: 'photo', sort: 'amount_desc' })
    const sort = screen.getByRole('group', { name: FEED_COPY.rail.sort })
    expect(within(sort).getByRole('link', { name: GIG_SORT_LABELS.created_at })).toHaveAttribute('href', '/?category=photo')
    expect(within(sort).getByRole('link', { name: GIG_SORT_LABELS.amount_asc })).toHaveAttribute('href', '/?category=photo&sort=amount_asc')
  })

  it('marks the active sort as CURRENT', () => {
    renderRail({ sort: 'amount_desc' })
    const sort = screen.getByRole('group', { name: FEED_COPY.rail.sort })
    expect(within(sort).getByRole('link', { name: GIG_SORT_LABELS.amount_desc })).toHaveAttribute('aria-current', 'true')
    expect(within(sort).getByRole('link', { name: GIG_SORT_LABELS.created_at })).not.toHaveAttribute('aria-current')
  })

  it('carries a non-default sort through a SEARCH as a hidden field, and never the default', () => {
    const { container, unmount } = renderRail({ sort: 'amount_asc' })
    expect(container.querySelector('input[type="hidden"][name="sort"]')).toHaveAttribute('value', 'amount_asc')
    unmount()
    const bare = renderRail().container
    expect(bare.querySelector('input[type="hidden"][name="sort"]')).toBeNull()
  })

  it('draws each chain row as the shared badge, named by the chain', () => {
    renderRail()
    const chains = screen.getByRole('group', { name: FEED_COPY.rail.chain })
    const row = within(chains).getByRole('link', { name: 'Solana Devnet' })
    expect(row.querySelector('[data-chain-badge="solana:devnet"]')).not.toBeNull()
    expect(within(chains).getByRole('link', { name: FEED_COPY.rail.allChains })).toHaveAttribute('href', '/')
  })

  it('carries filters with no form control of their own as hidden fields', () => {
    // Without these a search would silently clear the category set one
    // control above it.
    const { container } = renderRail({ category: 'photo', country: 'KE', remote: 'true' })
    const hidden = Array.from(container.querySelectorAll('input[type="hidden"]')).map((el) => [
      el.getAttribute('name'),
      el.getAttribute('value'),
    ])
    expect(hidden).toEqual(
      expect.arrayContaining([
        ['category', 'photo'],
        ['country', 'KE'],
        ['remote', 'true'],
      ]),
    )
  })

  it('carries the city and cross-border filters as hidden fields too', () => {
    const { container } = renderRail({
      city: 'Accra',
      cross_border: 'true',
      chain_id: 'eip155:84532',
    })
    const hidden = Array.from(container.querySelectorAll('input[type="hidden"]')).map((el) => [
      el.getAttribute('name'),
      el.getAttribute('value'),
    ])
    expect(hidden).toEqual(
      expect.arrayContaining([
        ['city', 'Accra'],
        ['cross_border', 'true'],
        ['chain_id', 'eip155:84532'],
      ]),
    )
  })

  it('cross-border toggles off as well as on', () => {
    renderRail({ cross_border: 'true' })
    expect(
      screen.getByRole('link', { name: FEED_COPY.rail.crossBorder }).getAttribute('href'),
    ).toBe('/')
  })

  it('changes sort without resetting the reader to the top', () => {
    // Next's <Link scroll={false}> — the row is a link, and the walk from
    // the reader's place in the feed to a re-sorted one must not jump.
    renderRail({ category: 'photo' })
    const sort = screen.getByRole('group', { name: FEED_COPY.rail.sort })
    expect(within(sort).getByRole('link', { name: GIG_SORT_LABELS.amount_asc })).toHaveAttribute('href', '/?category=photo&sort=amount_asc')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('offers a submit for readers with no JavaScript', () => {
    const { container } = renderRail()
    expect(container.querySelector('noscript')).not.toBeNull()
  })

  it('keeps the search box seeded with the active query', () => {
    renderRail({ q: 'tiler' })
    expect(screen.getByLabelText(FEED_COPY.rail.search)).toHaveValue('tiler')
  })

  it('shows "clear all" only once something is actually filtered', () => {
    const { unmount } = renderRail()
    expect(screen.queryByText(FEED_COPY.rail.clear)).not.toBeInTheDocument()
    unmount()

    renderRail({ city: 'Lagos' })
    expect(screen.getByRole('link', { name: FEED_COPY.rail.clear })).toHaveAttribute('href', '/')
  })

  it('NAMES each group of filter links, so the rail is not one flat run of them', () => {
    // Without this the rail reaches a screen reader as twenty-five links in a
    // row — "All categories, Delivery, … Anywhere, Nigeria, …, Any chain,
    // Solana Devnet" — with no way to tell a market from a category, and with
    // three links all named "All …" pointing at /gigs. Verified against a real
    // browser's accessibility tree before this was added.
    renderRail()
    for (const name of [
      FEED_COPY.rail.category,
      FEED_COPY.rail.market,
      FEED_COPY.rail.arrangement,
      FEED_COPY.rail.chain,
    ]) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument()
    }
  })

  it('puts each filter link INSIDE the group that names it', () => {
    renderRail()
    const market = screen.getByRole('group', { name: FEED_COPY.rail.market })
    expect(within(market).getByRole('link', { name: LOCATIONS.NG.name })).toBeInTheDocument()
    // …and not in a neighbouring one, which an id collision would produce.
    const category = screen.getByRole('group', { name: FEED_COPY.rail.category })
    expect(within(category).queryByRole('link', { name: LOCATIONS.NG.name })).toBeNull()
    expect(within(category).getByRole('link', { name: CATEGORY_LABELS.digital })).toBeInTheDocument()
  })

  it('leaves the single-control block as a LABEL, which is the stronger tie', () => {
    // A <label> already associates the name with its control; wrapping it in
    // a group as well would announce the name twice. Sort is a group of links
    // since #60, so it is named the way the other link runs are.
    renderRail()
    expect(screen.queryByRole('group', { name: FEED_COPY.rail.search })).toBeNull()
    expect(screen.getByLabelText(FEED_COPY.rail.search)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: FEED_COPY.rail.sort })).toBeInTheDocument()
  })

  it('states no keyboard hint of its own — that moved to the feed heading (#60)', () => {
    renderRail()
    expect(document.querySelector('kbd')).toBeNull()
  })

  it('is sticky beside the list and scrolls within itself on a tall rail', () => {
    renderRail()
    const rail = screen.getByRole('complementary', { name: 'Filter gigs' })
    expect(rail.className).toContain('lg:sticky')
    expect(rail.className).toContain('lg:overflow-y-auto')
    expect(rail.className).toContain('lg:max-h-')
  })
})
