/**
 * My Gigs as a list column.
 *
 * Both pieces of list state ride the URL, and that is the property under test:
 * the slot REMOUNTS on every gig the reader opens, so a tab or a chain filter
 * held in component state would reset at the worst possible moment — the row
 * they just clicked leaving the list beside them.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chainLabel, formatFullName, gigPlaceLabel, type GigSummary, type MyApplication } from '@tenda/shared'
import type { PaginatedListState } from '@/hooks/pagination/usePaginatedList'
import { MyGigsListColumn } from '@/components/gig/my-gigs/MyGigsListColumn'
import { MY_GIGS_COPY, myGigHref, myGigsHref, myGigsTab } from '@/components/gig/my-gigs/copy'
import { GigRowSubtitle } from '@/components/gig/my-gigs/row-subtitle'
import { useMyGigs } from '@/hooks/gig/useMyGigs'
import { useChainRegistryStore } from '@/stores/chain-registry.store'
import { deliveryGig, photoGig } from '@/e2e/fixtures/gigs'

let searchParams = new URLSearchParams()
let routeParams: { escrowId?: string } = {}
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useParams: () => routeParams,
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => '/my-gigs',
}))
vi.mock('@/hooks/gig/useMyGigs', () => ({ useMyGigs: vi.fn() }))

const listOf = <T,>(items: T[], overrides: Partial<PaginatedListState<T>> = {}) => ({
  items,
  total: items.length,
  hasMore: false,
  isLoading: false,
  isLoadingMore: false,
  isRefreshing: false,
  hasFetched: true,
  error: null,
  loadMore: vi.fn(),
  refresh: vi.fn(),
  reload: vi.fn(),
  reconcile: vi.fn(),
  applyRealtimeItems: vi.fn(),
  ...overrides,
})

const state = (overrides: Partial<ReturnType<typeof useMyGigs>> = {}) => {
  const value = {
    posted: listOf<GigSummary>([deliveryGig]),
    working: listOf<GigSummary>([photoGig]),
    drafts: listOf<GigSummary>([]),
    applications: listOf<MyApplication>([]),
    ...overrides,
  }
  vi.mocked(useMyGigs).mockReturnValue(value as ReturnType<typeof useMyGigs>)
  return value
}

afterEach(() => {
  cleanup()
  searchParams = new URLSearchParams()
  routeParams = {}
  vi.clearAllMocks()
})

describe('the URL helpers', () => {
  it('keeps the default tab and "all chains" OFF the URL', () => {
    // One view, one address: /my-gigs and /my-gigs?mine=posted are the same
    // list, and only one of them should be linkable.
    expect(myGigsHref('posted', null)).toBe('/my-gigs')
    expect(myGigsHref('working', null)).toBe('/my-gigs?mine=working')
    expect(myGigsHref('posted', 'eip155:42220')).toBe('/my-gigs?chain=eip155%3A42220')
    expect(myGigHref('e1', 'posted', null)).toBe('/my-gigs/e1')
    expect(myGigHref('e1', 'working', 'solana:devnet')).toBe(
      '/my-gigs/e1?mine=working&chain=solana%3Adevnet',
    )
  })

  it('narrows an unknown ?mine= to the default rather than passing it on', () => {
    expect(myGigsTab('working')).toBe('working')
    expect(myGigsTab('applications')).toBe('applications')
    expect(myGigsTab('archived')).toBe('posted')
    expect(myGigsTab(null)).toBe('posted')
  })
})

describe('MyGigsListColumn', () => {
  it('reads the tab from the URL and passes the chain to the hook', () => {
    searchParams = new URLSearchParams('mine=working&chain=solana:devnet')
    state()
    render(<MyGigsListColumn />)
    expect(useMyGigs).toHaveBeenCalledWith('solana:devnet')
    expect(screen.getByRole('link', { name: /^Working/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: new RegExp(photoGig.title) })).toBeInTheDocument()
  })

  it('carries the tab AND the chain into every row href', () => {
    // Otherwise opening a row remounts the column onto the default view and
    // the gig they clicked is no longer in the list beside them.
    searchParams = new URLSearchParams('mine=working&chain=solana:devnet')
    state()
    render(<MyGigsListColumn />)
    expect(screen.getByRole('link', { name: new RegExp(photoGig.title) })).toHaveAttribute(
      'href',
      myGigHref(photoGig.escrow_id, 'working', 'solana:devnet'),
    )
  })

  it('shows the poster on Working rows and never on your own Posted rows', () => {
    // On Working the creator is the OTHER party — a face worth drawing. On
    // Posted the creator is the reader, and their own name is furniture.
    searchParams = new URLSearchParams('mine=working')
    state()
    render(<MyGigsListColumn />)
    // The names come from the FIXTURES, not from literals: the two gigs have
    // different posters, and a hardcoded name silently stops testing anything
    // the day a fixture is renamed.
    const workingPoster = formatFullName(photoGig.creator.first_name, photoGig.creator.last_name)
    const ownName = formatFullName(deliveryGig.creator.first_name, deliveryGig.creator.last_name)
    expect(screen.getByRole('link', { name: new RegExp(photoGig.title) })).toHaveTextContent(
      workingPoster,
    )
    cleanup()
    searchParams = new URLSearchParams()
    state()
    render(<MyGigsListColumn />)
    expect(
      screen.getByRole('link', { name: new RegExp(deliveryGig.title) }),
    ).not.toHaveTextContent(ownName)
  })

  it('counts EVERY tab, not just the visible one', () => {
    // An inactive tab showing 0 for a list nobody fetched is a lie about how
    // much work the reader has.
    state({ posted: listOf<GigSummary>([deliveryGig]), working: listOf<GigSummary>([photoGig]) })
    render(<MyGigsListColumn />)
    expect(screen.getByRole('link', { name: /Posted/ })).toHaveTextContent('1')
    expect(screen.getByRole('link', { name: /Working/ })).toHaveTextContent('1')
  })

  it('holds a tab count back until that list has answered', () => {
    state({ working: listOf<GigSummary>([], { hasFetched: false, total: 0 }) })
    render(<MyGigsListColumn />)
    expect(screen.getByRole('link', { name: /^Working/ })).not.toHaveTextContent('0')
  })

  it('marks the open gig', () => {
    routeParams = { escrowId: deliveryGig.escrow_id }
    state()
    render(<MyGigsListColumn />)
    expect(screen.getByRole('link', { name: new RegExp(deliveryGig.title) })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('keeps an application detail inside the workspace', () => {
    // An applicant is not a party yet; /my-gigs/<id> is the view for a gig
    // that is already theirs.
    searchParams = new URLSearchParams('mine=applications')
    const application: MyApplication = {
      application: {
        id: 'app-1',
        escrow_id: deliveryGig.escrow_id,
        applicant_id: 'u1',
        wallet_address: null,
        status: 'open',
        message: null,
        created_at: '2026-08-15T10:00:00.000Z',
        expires_at: '2026-08-18T10:00:00.000Z',
      },
      gig: deliveryGig,
    }
    state({ applications: listOf<MyApplication>([application]) })
    render(<MyGigsListColumn />)
    expect(screen.getByRole('link', { name: new RegExp(deliveryGig.title) })).toHaveAttribute(
      'href',
      `/my-gigs/${deliveryGig.escrow_id}?mine=applications`,
    )
  })

  it('says which list is empty, not just "nothing here"', () => {
    searchParams = new URLSearchParams('mine=working')
    state({ working: listOf<GigSummary>([]) })
    render(<MyGigsListColumn />)
    expect(screen.getByText(MY_GIGS_COPY.surface('working').emptyTitle)).toBeInTheDocument()
  })

  it('does not deny gigs that exist on ANOTHER chain', () => {
    // "You have not posted a gig yet" is false for someone with three on a
    // chain the filter is hiding — and this is the reader's own list, so the
    // wrong answer is obviously wrong. Same rule as spec-correction #14.
    searchParams = new URLSearchParams('chain=solana:devnet')
    state({ posted: listOf<GigSummary>([]) })
    render(<MyGigsListColumn />)
    expect(screen.getByText(MY_GIGS_COPY.surface('posted', true).emptyTitle)).toBeInTheDocument()
    expect(screen.queryByText(MY_GIGS_COPY.surface('posted').emptyTitle)).toBeNull()
  })

  it('surfaces drafts as their own list, never as rows in Posted', () => {
    // "Posted" is POSTED_ESCROW_STATUSES exactly — a draft counted there would
    // inflate the chip with work that is not on-chain yet.
    state({ drafts: listOf<GigSummary>([deliveryGig, photoGig]) })
    render(<MyGigsListColumn />)
    const link = screen.getByRole('link', { name: MY_GIGS_COPY.drafts(2) })
    expect(link).toHaveAttribute('href', MY_GIGS_COPY.draftsHref)
    expect(screen.getByRole('link', { name: /Posted/ })).toHaveTextContent('1')
  })

  it('says nothing about drafts when there are none', () => {
    state()
    render(<MyGigsListColumn />)
    expect(screen.queryByText(/waiting to be funded/)).toBeNull()
  })

  it('filters by chain through the URL, and REPLACES rather than pushes', () => {
    // A filter is not a place: ten chips tapped would otherwise be ten Back
    // presses to leave the surface. And it has to be the URL, because the
    // column is remounted on every row it opens.
    useChainRegistryStore.setState({
      chains: [
        { id: 'eip155:42220', display_name: 'Celo' },
        { id: 'solana:devnet', display_name: 'Solana' },
      ] as never,
    })
    searchParams = new URLSearchParams('mine=working')
    state()
    render(<MyGigsListColumn />)
    fireEvent.click(screen.getByRole('button', { name: 'Celo' }))
    expect(replace).toHaveBeenCalledWith(myGigsHref('working', 'eip155:42220'))
  })

  it('offers no chain filter on Applied, which the wire cannot filter', () => {
    // /v1/applications is caller-scoped with no chain parameter; a chip that
    // changed nothing would be a control that lies.
    useChainRegistryStore.setState({
      chains: [
        { id: 'eip155:42220', display_name: 'Celo' },
        { id: 'solana:devnet', display_name: 'Solana' },
      ] as never,
    })
    searchParams = new URLSearchParams('mine=applications')
    state()
    render(<MyGigsListColumn />)
    expect(screen.queryByRole('group', { name: 'Chain filter' })).toBeNull()
  })
})

describe('GigRowSubtitle', () => {
  it('says where and on which chain — the two things the wire actually has', () => {
    // The comp puts "4 applicants" or the counterparty's name here. Neither is
    // on `GigSummary`, and inventing them is spec-correction #13's mistake.
    const { container } = render(<GigRowSubtitle gig={deliveryGig} />)
    expect(container.textContent).toContain(gigPlaceLabel(deliveryGig))
    expect(container.textContent).toContain('·')
    expect(container.textContent).not.toMatch(/applicant/i)
    // The chain is the shared badge (#60), not a grey word.
    expect(container.querySelector(`[data-chain-badge="${deliveryGig.chain_id}"]`)).not.toBeNull()
    expect(container.textContent).toContain(chainLabel(deliveryGig.chain_id))
  })
})
