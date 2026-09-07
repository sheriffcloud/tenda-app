/**
 * "My Disputes" as a list column.
 *
 * The bucket is the interesting part. It lives in the URL because the slot
 * REMOUNTS when the route moves from /disputes to /dispute/<id>, and a bucket
 * held in component state would throw the reader back to Open the moment they
 * opened a resolved dispute — taking the row they clicked off the list beside
 * them.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MyDisputeRow } from '@tenda/shared'
import { DisputesListColumn } from '@/components/dispute/DisputesListColumn'
import {
  DISPUTES_LIST_COPY,
  disputeBucket,
  disputeThreadHref,
  disputesHref,
} from '@/components/dispute/copy'
import { useMyDisputes } from '@/hooks/dispute/useMyDisputes'

let searchParams = new URLSearchParams()
let routeParams: { escrowId?: string } = {}
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useParams: () => routeParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/disputes',
}))
vi.mock('@/hooks/dispute/useMyDisputes', () => ({ useMyDisputes: vi.fn() }))

const rowOf = (over: Partial<MyDisputeRow> = {}): MyDisputeRow => ({
  dispute_id: 'd1',
  escrow_id: 'e1',
  kind: 'gig',
  subject_title: 'Paint my fence',
  status: 'disputed',
  my_role: 'creator',
  counterparty_name: 'Bola Ade',
  reason: 'not done',
  raised_at: '2026-08-15T10:00:00.000Z',
  winner: null,
  resolved_at: null,
  raised_by_me: true,
  ...over,
})

/**
 * The column mounts BOTH buckets (the counts need real totals), so the mock
 * answers per status. One `over` styles both buckets — the shape most tests
 * want — and `resolvedOver` splits them for the count assertions.
 */
const listState = (
  over: Partial<ReturnType<typeof useMyDisputes>> = {},
  resolvedOver?: Partial<ReturnType<typeof useMyDisputes>>,
) => {
  const base = {
    items: [rowOf()],
    total: 1,
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
  }
  const openState = { ...base, ...over }
  const resolvedState = resolvedOver === undefined ? openState : { ...base, ...resolvedOver }
  vi.mocked(useMyDisputes).mockImplementation(
    (status) => (status === 'open' ? openState : resolvedState) as ReturnType<typeof useMyDisputes>,
  )
  return openState
}

afterEach(() => {
  cleanup()
  searchParams = new URLSearchParams()
  routeParams = {}
  vi.clearAllMocks()
})

describe('the bucket helpers', () => {
  it('narrows ?status= to the two the API takes', () => {
    expect(disputeBucket('resolved')).toBe('resolved')
    expect(disputeBucket('open')).toBe('open')
    // Anything else — a typo, a stale link, a probe — is the default view, not
    // a request the server has to refuse.
    expect(disputeBucket('archived')).toBe('open')
    expect(disputeBucket(null)).toBe('open')
    expect(disputeBucket('')).toBe('open')
  })

  it('leaves the DEFAULT bucket off the URL', () => {
    // /disputes and /disputes?status=open are the same view; only one of them
    // should be linkable, or the canonical route has a twin.
    expect(disputesHref('open')).toBe('/disputes')
    expect(disputesHref('resolved')).toBe('/disputes?status=resolved')
    expect(disputeThreadHref('e1', 'open')).toBe('/dispute/e1')
    expect(disputeThreadHref('e1', 'resolved')).toBe('/dispute/e1?status=resolved')
  })
})

describe('DisputesListColumn', () => {
  it('reads the bucket from the URL and marks its tab', () => {
    searchParams = new URLSearchParams('status=resolved')
    listState()
    render(<DisputesListColumn />)
    expect(useMyDisputes).toHaveBeenCalledWith('resolved')
    expect(screen.getByRole('link', { name: /^Resolved/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /^Open/ })).not.toHaveAttribute('aria-current')
  })

  it('counts EVERY tab from its OWN bucket, not the visible one twice', () => {
    // An inactive tab showing 0 — or the active bucket's number — for a list
    // nobody fetched is a lie about how much is waiting there.
    listState({ total: 3 }, { total: 5, items: [] })
    render(<DisputesListColumn />)
    expect(screen.getByRole('link', { name: /^Open/ })).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: /^Resolved/ })).toHaveTextContent('5')
  })

  it('holds a tab count back until ITS bucket has answered', () => {
    listState({ total: 3 }, { total: 0, hasFetched: false, items: [] })
    render(<DisputesListColumn />)
    expect(screen.getByRole('link', { name: /^Open/ })).toHaveTextContent('3')
    // No digits at all — "0" before the fetch lands is a claim.
    expect(screen.getByRole('link', { name: /^Resolved/ }).textContent).toBe('Resolved')
  })

  it('carries the bucket into every row href', () => {
    // Otherwise opening a resolved dispute remounts the column into Open and
    // the row the reader just clicked is no longer in the list beside them.
    searchParams = new URLSearchParams('status=resolved')
    listState()
    render(<DisputesListColumn />)
    expect(screen.getByRole('link', { name: /Paint my fence/ })).toHaveAttribute(
      'href',
      '/dispute/e1?status=resolved',
    )
  })

  it('marks the row whose thread is open, matched by ESCROW id', () => {
    // The route carries the escrow id; the row is keyed by the dispute id.
    routeParams = { escrowId: 'e1' }
    listState()
    render(<DisputesListColumn />)
    expect(screen.getByRole('link', { name: /Paint my fence/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('names an exchange dispute, which has no title of its own', () => {
    listState({ items: [rowOf({ kind: 'exchange', subject_title: null })] })
    render(<DisputesListColumn />)
    expect(
      screen.getByRole('link', { name: new RegExp(DISPUTES_LIST_COPY.untitled('exchange')) }),
    ).toBeInTheDocument()
  })

  it('offers Load more only while there IS more', async () => {
    const state = listState({ hasMore: true })
    render(<DisputesListColumn />)
    await userEvent.click(screen.getByRole('button', { name: DISPUTES_LIST_COPY.loadMore }))
    expect(state.loadMore).toHaveBeenCalledTimes(1)

    cleanup()
    listState({ hasMore: false })
    render(<DisputesListColumn />)
    expect(screen.queryByRole('button', { name: DISPUTES_LIST_COPY.loadMore })).toBeNull()
  })

  it('does not offer a pager over a list that has not loaded', () => {
    // A control over nothing: the footer rides with the rows.
    listState({ hasMore: true, isLoading: true, items: [] })
    render(<DisputesListColumn />)
    expect(screen.queryByRole('button', { name: DISPUTES_LIST_COPY.loadMore })).toBeNull()
  })

  it('says which bucket is empty, not just "nothing here"', () => {
    searchParams = new URLSearchParams('status=resolved')
    listState({ items: [], total: 0 })
    render(<DisputesListColumn />)
    expect(
      screen.getByText(DISPUTES_LIST_COPY.surface('resolved').emptyTitle),
    ).toBeInTheDocument()
  })

  it('holds the count back until the first page has actually landed', () => {
    // `total` is 0 before the request answers, and "0 open" is a claim.
    listState({ items: [], total: 0, hasFetched: false, isLoading: true })
    render(<DisputesListColumn />)
    expect(screen.queryByText(DISPUTES_LIST_COPY.count(0, 'open'))).toBeNull()
  })

  it('retries the list from its error state', async () => {
    const state = listState({ error: 'boom', items: [] })
    render(<DisputesListColumn />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(state.reload).toHaveBeenCalledTimes(1)
  })
})
