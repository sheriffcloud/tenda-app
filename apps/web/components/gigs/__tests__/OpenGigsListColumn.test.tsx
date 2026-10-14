/**
 * The open-gigs column's STATIC half: the list shell, row rendering, the empty
 * state, the retry, and where a row leads.
 *
 * Anything a `feed:gigs` frame or a dropped socket drives lives in
 * `OpenGigsListColumn.live.test.tsx`; shared fixtures in `open-gigs-harness.tsx`.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import type { GigFeedServerFrame } from '@tenda/shared'
import { deliveryGig } from '@/e2e/fixtures/gigs'

const listGigs = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ api: { gigs: { list: listGigs } } }))

// The global setup pins `usePathname` to '/', so the column's selected-row
// branch could never run. Overridden here rather than there: only this suite
// needs to stand on a gig's own route.
const nav = vi.hoisted(() => ({ pathname: '/gigs', push: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
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

beforeEach(() => {
  nav.pathname = '/gigs'
  nav.push.mockClear()
  listGigs.mockReset()
  seams.listener = null
  seams.connected = true
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

it('shows the list shell while open gigs load', () => {
  listGigs.mockReturnValue(new Promise(() => {}))
  render(<OpenGigsListColumn />)
  expect(screen.getByRole('heading', { name: 'Open gigs' })).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

it('opens a gig in the workspace detail route', async () => {
  listGigs.mockResolvedValue({ data: [deliveryGig], total: 1 })
  render(<OpenGigsListColumn />)
  expect(await screen.findByRole('link', { name: /Deliver a parcel across Yaba/ })).toHaveAttribute('href', '/gigs/gig-delivery-1')
  expect(screen.getByText('1 open')).toBeInTheDocument()
  expect(listGigs).toHaveBeenCalledWith({ limit: 30 })
})

it('browse rows are mini-cards: place, poster, rating and the take verb', async () => {
  // The redesign's fix for "the /home listing is basic": everything the feed
  // card shows while browsing, straight off GigSummary — nothing invented.
  listGigs.mockResolvedValue({ data: [deliveryGig], total: 1 })
  render(<OpenGigsListColumn />)
  const row = await screen.findByRole('link', { name: /Deliver a parcel across Yaba/ })
  expect(row).toHaveTextContent('Lagos')
  expect(row).toHaveTextContent('Ada Okafor')
  expect(row).toHaveTextContent('4.8')
  // requires_approval=false on this fixture → direct Accept, never Apply.
  expect(row).toHaveTextContent('Accept')
  expect(row).not.toHaveTextContent('Apply')
})

it('renders an honest empty state after a successful empty response', async () => {
  listGigs.mockResolvedValue({ data: [], total: 0 })
  render(<OpenGigsListColumn />)
  expect(await screen.findByText('No open gigs')).toBeInTheDocument()
})

it('retries a failed request and replaces the error with recovered data', async () => {
  listGigs.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: [deliveryGig], total: 1 })
  render(<OpenGigsListColumn />)
  await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
  expect(await screen.findByText(deliveryGig.title)).toBeInTheDocument()
  expect(listGigs).toHaveBeenCalledTimes(2)
})

/**
 * The keyboard cursor's address for a row, which nothing else exercises: the
 * rendered link and `hrefOf` are two different props, and only the link was
 * ever checked. They now share one builder — this is what proves the keyboard
 * half of it reaches the same place.
 */
it('opens the active row with Enter, at the same address the link uses', async () => {
  listGigs.mockResolvedValue({ data: [deliveryGig], total: 1 })
  render(<OpenGigsListColumn />)
  expect(await screen.findByText(deliveryGig.title)).toBeInTheDocument()

  await userEvent.keyboard('j')
  await userEvent.keyboard('{Enter}')

  expect(nav.push).toHaveBeenCalledWith(`/gigs/${deliveryGig.escrow_id}`)
})
