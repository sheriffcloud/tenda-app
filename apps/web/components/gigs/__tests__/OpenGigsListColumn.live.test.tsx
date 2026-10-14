/**
 * The open-gigs column's LIVE half — whatever a `feed:gigs` frame or a dropped
 * socket drives. The column used to fetch once and never again: measured as
 * one `/v1/gigs` request at first paint and still one twenty seconds later.
 * Static half in `OpenGigsListColumn.test.tsx`; fixtures in the harness.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GigFeedServerFrame, GigSummary } from '@tenda/shared'
import { deliveryGig } from '@/e2e/fixtures/gigs'
import {
  available,
  broadcastVia,
  otherGig,
  renderedGigIds,
  unavailable,
} from './open-gigs-harness'

const listGigs = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ api: { gigs: { list: listGigs } } }))

// The global setup pins `usePathname` to '/', so the column's selected-row
// branch could never run. Overridden here rather than there: only this suite
// needs to stand on a gig's own route.
const nav = vi.hoisted(() => ({ pathname: '/gigs' }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

// The feed broadcast, and whether this reader has a socket for it at all.
const seams = vi.hoisted(() => ({
  listener: null as ((event: GigFeedServerFrame) => void) | null,
  connected: true,
}))
vi.mock('@/stores/realtime.store', () => ({
  useRealtimeStore: (select: (state: { connected: boolean }) => boolean) =>
    select({ connected: seams.connected }),
  subscribeGigFeedChannel: (listener: (event: GigFeedServerFrame) => void) => {
    seams.listener = listener
    return () => { seams.listener = null }
  },
}))

import { OpenGigsListColumn } from '@/components/gigs/OpenGigsListColumn'
import { LIST_OFFLINE_POLL_MS } from '@tenda/shared'

/** This spec's own seam, bound to the shared pusher. */
function broadcast(frame: GigFeedServerFrame) {
  broadcastVia(seams.listener, frame)
}

beforeEach(() => {
  nav.pathname = '/gigs'
  listGigs.mockReset()
  seams.listener = null
  seams.connected = true
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

describe('live open gigs', () => {
  afterEach(() => vi.useRealTimers())

  it('shows a gig posted while the reader is sitting on the list', async () => {
    listGigs.mockResolvedValue({ data: [deliveryGig], total: 1 })
    render(<OpenGigsListColumn />)
    expect(await screen.findByText(deliveryGig.title)).toBeInTheDocument()

    broadcast(available(otherGig('gig-new', '5', 'Fresh delivery'), '5'))

    expect(await screen.findByText('Fresh delivery')).toBeInTheDocument()
    // Without refetching: the frame carried the gig.
    expect(listGigs).toHaveBeenCalledTimes(1)
  })

it('marks the row whose gig is open in the detail pane', async () => {
    // The one thing that tells a reader WHICH of these rows they are looking
    // at. The pathname is the only input that decides it.
    nav.pathname = `/gigs/${deliveryGig.escrow_id}`
    listGigs.mockResolvedValue({ data: [deliveryGig, otherGig('gig-other', '1', 'Other')], total: 2 })
    render(<OpenGigsListColumn />)

    // Rows mark themselves with aria-current="true" (RowChassis), which is
    // what the sibling column tests assert on too.
    const rows = await screen.findAllByRole('link')
    const gigRows = rows.filter((row) => row.getAttribute('href')?.startsWith('/gigs/'))
    expect(gigRows).toHaveLength(2)
    expect(
      gigRows.find((row) => row.getAttribute('href') === `/gigs/${deliveryGig.escrow_id}`),
    ).toHaveAttribute('aria-current', 'true')
    expect(
      gigRows.find((row) => row.getAttribute('href') === '/gigs/gig-other'),
    ).not.toHaveAttribute('aria-current')
  })

  it('applies a frame that lands before the first page has settled', async () => {
    // The narrow race the reader never sees but the code must survive: the
    // socket is live from mount, so a gig can be broadcast while the opening
    // request is still out. It must not throw, and must not invent a total for
    // a list that has never had one.
    let settle: (value: { data: GigSummary[]; total: number }) => void = () => {}
    listGigs.mockReturnValue(new Promise((resolve) => { settle = resolve }))
    render(<OpenGigsListColumn />)

    broadcast(available(otherGig('gig-early', '2', 'Early bird'), '2'))
    expect(await screen.findByText('Early bird')).toBeInTheDocument()
    // No count while the phase is still loading — "1 open" would be a claim
    // about a server total nobody has answered yet.
    expect(screen.queryByText(/\d+ open/)).not.toBeInTheDocument()

    await act(async () => { settle({ data: [deliveryGig], total: 1 }) })
    expect(await screen.findByText('1 open')).toBeInTheDocument()
  })

  /** ORDER, not presence: a newer gig arriving at the BOTTOM of the list is
   *  the reported bug wearing a different hat. */
  it('puts a newer gig at the TOP, not merely somewhere in the list', async () => {
    const older = { ...deliveryGig, created_at: '2026-08-20T00:00:00.000Z' }
    listGigs.mockResolvedValue({ data: [older], total: 1 })
    render(<OpenGigsListColumn />)
    expect(await screen.findByText(older.title)).toBeInTheDocument()

    broadcast(available(otherGig('gig-new', '5', 'Fresh delivery', '2026-08-24T00:00:00.000Z'), '5'))
    expect(await screen.findByText('Fresh delivery')).toBeInTheDocument()
    expect(renderedGigIds()).toEqual(['gig-new', older.escrow_id])

    // ...and an OLDER arrival takes its place behind the rows already there.
    broadcast(available(otherGig('gig-ancient', '6', 'Ancient delivery', '2026-08-01T00:00:00.000Z'), '6'))
    expect(await screen.findByText('Ancient delivery')).toBeInTheDocument()
    expect(renderedGigIds()).toEqual(['gig-new', older.escrow_id, 'gig-ancient'])
  })

  it('takes away a gig somebody else has taken', async () => {
    listGigs.mockResolvedValue({ data: [deliveryGig], total: 1 })
    render(<OpenGigsListColumn />)
    expect(await screen.findByText(deliveryGig.title)).toBeInTheDocument()

    broadcast(unavailable(deliveryGig.escrow_id, '9'))

    await waitFor(() => expect(screen.queryByText(deliveryGig.title)).not.toBeInTheDocument())
    expect(listGigs).toHaveBeenCalledTimes(1)
  })

  it('moves the count with the rows, and never below zero', async () => {
    listGigs.mockResolvedValue({ data: [deliveryGig], total: 1 })
    render(<OpenGigsListColumn />)
    expect(await screen.findByText('1 open')).toBeInTheDocument()

    broadcast(available(otherGig('gig-new', '5', 'Fresh delivery'), '5'))
    expect(await screen.findByText('2 open')).toBeInTheDocument()

    broadcast(unavailable('gig-new', '6'))
    expect(await screen.findByText('1 open')).toBeInTheDocument()
    broadcast(unavailable(deliveryGig.escrow_id, '7'))
    expect(await screen.findByText('0 open')).toBeInTheDocument()
    // A removal for a row this page never held moves nothing.
    broadcast(unavailable('never-here', '8'))
    expect(await screen.findByText('0 open')).toBeInTheDocument()
  })

  /**
   * The floor, exercised for real. Asserting it after a removal the page never
   * held proves nothing — that delta is 0, so `Math.max` never engages. It
   * takes a page whose rows outnumber its total, which a server CAN answer
   * when the count and the page are computed under concurrent writes.
   */
  it('never prints a negative count when the total is behind the rows', async () => {
    listGigs.mockResolvedValue({ data: [deliveryGig], total: 0 })
    render(<OpenGigsListColumn />)
    expect(await screen.findByText(deliveryGig.title)).toBeInTheDocument()
    expect(screen.getByText('0 open')).toBeInTheDocument()

    broadcast(unavailable(deliveryGig.escrow_id, '9'))

    expect(await screen.findByText('0 open')).toBeInTheDocument()
    expect(screen.queryByText('-1 open')).not.toBeInTheDocument()
  })

  /** A slow first page must not overwrite a newer answer — the generation
   *  guard is all that stops the list flipping back to older rows. */
  it('drops a stale response that lands after a newer one', async () => {
    // Two fetches overlap for real: the offline fallback fires a reconcile
    // while the opening request is still out. Without the generation guard the
    // slow first answer lands last and flips the list back to older rows.
    vi.useFakeTimers()
    let settleFirst: (value: { data: GigSummary[]; total: number }) => void = () => {}
    listGigs
      .mockReturnValueOnce(new Promise((resolve) => { settleFirst = resolve }))
      .mockResolvedValueOnce({ data: [otherGig('fresh', '2', 'Fresh rows')], total: 1 })
    seams.connected = false

    render(<OpenGigsListColumn />)
    await act(async () => {})
    await act(async () => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS) })
    expect(listGigs).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Fresh rows')).toBeInTheDocument()

    // The original request finally answers, with what it saw long ago.
    await act(async () => { settleFirst({ data: [deliveryGig], total: 1 }) })

    expect(screen.getByText('Fresh rows')).toBeInTheDocument()
    expect(screen.queryByText(deliveryGig.title)).not.toBeInTheDocument()
  })

  /**
   * A retry the reader ASKED for says something is happening; the error banner
   * it replaces must go. A background reconcile deliberately does neither.
   */
  it('clears the error while a reader-requested retry is in flight', async () => {
    let settleRetry: (value: { data: GigSummary[]; total: number }) => void = () => {}
    listGigs
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(new Promise((resolve) => { settleRetry = resolve }))

    render(<OpenGigsListColumn />)
    expect(await screen.findByText('Could not load open gigs')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByText('Could not load open gigs')).not.toBeInTheDocument()

    await act(async () => { settleRetry({ data: [deliveryGig], total: 1 }) })
    expect(await screen.findByText(deliveryGig.title)).toBeInTheDocument()
  })

  it('ignores a frame older than what the row already carries', async () => {
    const current = otherGig('gig-a', '7', 'Current title')
    listGigs.mockResolvedValue({ data: [current], total: 1 })
    render(<OpenGigsListColumn />)
    expect(await screen.findByText('Current title')).toBeInTheDocument()

    broadcast(available(otherGig('gig-a', '6', 'Stale title'), '6'))

    await waitFor(() => expect(screen.queryByText('Stale title')).not.toBeInTheDocument())
    expect(screen.getByText('Current title')).toBeInTheDocument()
  })

  it('refetches on the shared interval when the reader has no socket', async () => {
    // Fake timers BEFORE the render: the interval is created in a mount
    // effect, so switching clocks afterwards leaves a real one running and the
    // test measures nothing.
    vi.useFakeTimers()
    listGigs.mockResolvedValue({ data: [deliveryGig], total: 1 })
    seams.connected = false
    render(<OpenGigsListColumn />)
    await act(async () => {}) // let the mount fetch settle
    expect(screen.getByText(deliveryGig.title)).toBeInTheDocument()
    expect(listGigs).toHaveBeenCalledTimes(1)

    await act(async () => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS) })
    expect(listGigs).toHaveBeenCalledTimes(2)
    // Silently: rows stay put rather than blinking through a skeleton.
    expect(screen.getByText(deliveryGig.title)).toBeInTheDocument()
  })

/**
   * A failed BACKGROUND revalidation must not take the reader's rows away.
   *
   * `ListColumn` renders rows only while `error === null`, so handing it an
   * error with rows behind it blanks the list. The offline fallback refetches
   * every 15s while the socket is down — and while the socket is down those
   * refetches are exactly the ones likely to fail, so a reader who went offline
   * with a good list would watch it turn into an error banner. Every sibling
   * column guards this the same way: the error is only shown when there is
   * nothing left to show.
   */
  it('keeps the rows when a background revalidation fails', async () => {
    vi.useFakeTimers()
    listGigs.mockResolvedValueOnce({ data: [deliveryGig], total: 1 })
    seams.connected = false
    render(<OpenGigsListColumn />)
    await act(async () => {})
    expect(screen.getByText(deliveryGig.title)).toBeInTheDocument()

    listGigs.mockRejectedValueOnce(new Error('still offline'))
    await act(async () => { vi.advanceTimersByTime(LIST_OFFLINE_POLL_MS) })

    expect(listGigs).toHaveBeenCalledTimes(2)
    expect(screen.getByText(deliveryGig.title)).toBeInTheDocument()
    expect(screen.queryByText('Could not load open gigs')).not.toBeInTheDocument()
    // ...and the count stays with them. A failed attempt does not unlearn a
    // total that was answered; the siblings key theirs on "has ever fetched".
    expect(screen.getByText('1 open')).toBeInTheDocument()
  })

  it('stops listening once the column is unmounted', async () => {
    listGigs.mockResolvedValue({ data: [deliveryGig], total: 1 })
    const { unmount } = render(<OpenGigsListColumn />)
    expect(await screen.findByText(deliveryGig.title)).toBeInTheDocument()
    // Subscribed at all — without this the assertion below passes on a column
    // that never listened.
    expect(seams.listener).not.toBeNull()
    unmount()
    expect(seams.listener).toBeNull()
  })
})
