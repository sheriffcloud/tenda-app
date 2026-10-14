/**
 * The grid view of the open feed: the same data path as the column, drawn as
 * cards that open the WORKSPACE detail, with the toolbar's filters reaching
 * the query.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CATEGORY_LABELS, type GigFeedServerFrame, type GigSummary } from '@tenda/shared'
import { deliveryGig, photoGig } from '@/e2e/fixtures/gigs'
import { GIGS_SEARCH_DEBOUNCE_MS } from '@/components/gigs/GigsSearchField'
import { OPEN_GIGS_COPY } from '@/components/gigs/copy'
import { OPEN_GIGS_LIMIT } from '@/hooks/gig/useOpenGigs'
import { useGigsBrowseStore } from '@/stores/gigs-browse.store'

const listGigs = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ api: { gigs: { list: listGigs } } }))

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

import { OpenGigsGrid } from '@/components/gigs/OpenGigsGrid'

beforeEach(() => {
  listGigs.mockReset()
  seams.listener = null
  useGigsBrowseStore.setState({ category: null, q: '' })
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

afterEach(() => {
  vi.useRealTimers()
})

it('draws each open gig as a grid card that opens the WORKSPACE detail, and says how many', async () => {
  listGigs.mockResolvedValue({ data: [deliveryGig, photoGig], total: 2 })
  render(<OpenGigsGrid />)
  const card = await screen.findByRole('link', { name: new RegExp(deliveryGig.title) })
  expect(card).toHaveAttribute('href', `/gigs/${deliveryGig.escrow_id}`)
  expect(card).toHaveAttribute('data-gig-density', 'grid')
  expect(screen.getByText(OPEN_GIGS_COPY.count(2))).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: OPEN_GIGS_COPY.surface.title })).toBeInTheDocument()
  expect(listGigs).toHaveBeenCalledWith({ limit: OPEN_GIGS_LIMIT })
})

it('shows the skeleton while loading and an honest empty state after an empty answer', async () => {
  listGigs.mockReturnValue(new Promise(() => {}))
  const { unmount } = render(<OpenGigsGrid />)
  expect(screen.queryByRole('link')).toBeNull()
  expect(document.querySelector('.animate-shimmer')).not.toBeNull()
  unmount()
  listGigs.mockResolvedValue({ data: [], total: 0 })
  render(<OpenGigsGrid />)
  expect(await screen.findByText(OPEN_GIGS_COPY.surface.emptyTitle)).toBeInTheDocument()
})

it('says the read failed — money untouched — and retries into recovered rows', async () => {
  listGigs.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: [deliveryGig], total: 1 })
  render(<OpenGigsGrid />)
  expect(await screen.findByText(OPEN_GIGS_COPY.error)).toBeInTheDocument()
  expect(screen.getByText(OPEN_GIGS_COPY.errorBody)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: OPEN_GIGS_COPY.retry }))
  expect(await screen.findByText(deliveryGig.title)).toBeInTheDocument()
  expect(listGigs).toHaveBeenCalledTimes(2)
})

it('a category chip narrows the QUERY, and the stale rows are not shown for the new one', async () => {
  // The second answer is held back on purpose: the rows fetched for "all"
  // must be gone the moment the filter changes, not once the new page lands
  // — a frame of the old rows under the new chip is what the derived
  // loading state exists to prevent.
  let settle: (value: { data: GigSummary[]; total: number }) => void = () => {}
  listGigs
    .mockResolvedValueOnce({ data: [deliveryGig, photoGig], total: 2 })
    .mockReturnValueOnce(new Promise((resolve) => { settle = resolve }))
  render(<OpenGigsGrid />)
  await screen.findByText(deliveryGig.title)
  await userEvent.click(screen.getByRole('button', { name: CATEGORY_LABELS.photo }))
  expect(listGigs).toHaveBeenLastCalledWith({ limit: OPEN_GIGS_LIMIT, category: 'photo' })
  expect(screen.queryByText(deliveryGig.title)).toBeNull()
  expect(screen.queryByText(OPEN_GIGS_COPY.count(2))).toBeNull()
  expect(document.querySelector('.animate-shimmer')).not.toBeNull()
  await act(async () => { settle({ data: [photoGig], total: 1 }) })
  expect(await screen.findByText(OPEN_GIGS_COPY.count(1))).toBeInTheDocument()
  expect(screen.getByText(photoGig.title)).toBeInTheDocument()
  expect(screen.queryByText(deliveryGig.title)).toBeNull()
})

it('a typed search reaches the query once the debounce settles', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  listGigs.mockResolvedValue({ data: [deliveryGig], total: 1 })
  render(<OpenGigsGrid />)
  await screen.findByText(deliveryGig.title)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'parcel' } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GIGS_SEARCH_DEBOUNCE_MS)
  })
  expect(listGigs).toHaveBeenLastCalledWith({ limit: OPEN_GIGS_LIMIT, q: 'parcel' })
})

it('applies a live frame the way the column does — a new gig appears without a fetch', async () => {
  listGigs.mockResolvedValue({ data: [deliveryGig], total: 1 })
  render(<OpenGigsGrid />)
  await screen.findByText(deliveryGig.title)
  act(() => {
    seams.listener?.({
      type: 'gig_available',
      channel: 'feed:gigs',
      event_id: 'event-9',
      escrow_id: photoGig.escrow_id,
      gig_revision: '9',
      occurred_at: '2026-08-25T00:00:00.000Z',
      gig: { ...photoGig, public_feed_revision: '9' },
    })
  })
  expect(await screen.findByText(photoGig.title)).toBeInTheDocument()
  expect(screen.getByText(OPEN_GIGS_COPY.count(2))).toBeInTheDocument()
  expect(listGigs).toHaveBeenCalledTimes(1)
})
