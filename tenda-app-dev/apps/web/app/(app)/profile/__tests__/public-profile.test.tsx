/**
 * /profile/[id] — a stranger's page, which is where the rating denominator
 * earns its keep: this is the screen someone reads before deciding to trade.
 *
 * The review TOTAL comes from the server; the list is one page of it. Those
 * two numbers must not be confused, in either direction.
 *
 * The completed-work chips are here for the same reason and are asserted in
 * the same spirit: a stranger's reputation signals, phrased for a stranger.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { getMock, reviewsMock, completedWorkMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  reviewsMock: vi.fn(),
  completedWorkMock: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  api: {
    users: {
      get: (params: { id: string }) => getMock(params),
      reviews: (params: { id: string }, query: { limit: number; offset: number }) =>
        reviewsMock(params, query),
      completedWork: (params: { id: string }) => completedWorkMock(params),
    },
  },
}))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'u2' }) }))
vi.mock('@/components/profile/StandingBadge', () => ({ StandingBadge: () => null }))

import UserProfilePage from '@/app/(app)/profile/[id]/page'
import { AGENT_BADGE_LABEL, type Review, type User } from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'
import { makePublicUser } from '@/test/factories/user'

// The REAL wire row (typed factory), not a hand-picked subset the page happens
// to read today: a field the page starts reading is then present as the server
// sends it, never invented here.
const USER = makePublicUser({ id: 'u2', first_name: 'Grace', last_name: 'Hopper', review_score: '4.80' })

/**
 * Typed as the real row on purpose. This fixture claimed `rating` and a nested
 * `reviewer` — neither is on the wire (the column is `score`, and the list
 * endpoint serves bare rows). It passed because the mock is untyped and the
 * assertions never read the card, so ReviewCard was being handed a row the
 * server cannot send.
 */
const review = (id: string): Review => ({
  id,
  escrow_id: 'esc-1',
  reviewer_id: 'u3',
  reviewee_id: 'u2',
  score: 5,
  comment: 'Great work',
  created_at: '2026-01-01T00:00:00Z',
})

/**
 * Let the page's async hooks settle before the tree is unmounted (#87).
 *
 * Most cases here assert on the rating or the review list and finish while
 * `useCompletedWork` is still resolving — it awaits a microtask, clears, then
 * awaits the endpoint. Whether its final `setWork` lands before RTL's cleanup
 * is a RACE, and it was measured: without this flush the number of times the
 * file renders the hook VARIES run to run — 14 through 17 across the samples
 * taken, with later batches spreading wider than earlier ones, so treat those
 * as samples rather than a bound. With the flush it is 18 every time. The varying count
 * fired the hook's `cancelled` early return a different number of times, v8
 * split its ranges at that line accordingly, and the file's reported branch
 * TOTAL moved between 9 and 10 on a tree nobody had touched.
 *
 * The render count is what this quotes because it is the half that reproduces
 * on demand; the branch flip is load-dependent and does not. Ten full runs
 * after this landed reported 9/9 every time.
 *
 * It is registered after the setup file's `cleanup`, and vitest runs afterEach
 * hooks in reverse registration order, so this runs FIRST. That ordering is not
 * taken on trust: a flush running after the unmount would find `cancelled`
 * already true and change nothing, so the count settling at 18 is itself the
 * proof it runs before.
 */
afterEach(async () => {
  await act(async () => {})
})

beforeEach(() => {
  getMock.mockReset().mockResolvedValue(USER)
  reviewsMock.mockReset()
  completedWorkMock.mockReset().mockResolvedValue({ data: [] })
  useAuthStore.setState({ user: { id: 'u1' } as User })
})

test('states the rating with the number of reviews behind it', async () => {
  reviewsMock.mockResolvedValue({ data: [review('r1'), review('r2')], total: 2 })
  render(<UserProfilePage />)
  await waitFor(() => expect(screen.getByText('4.8')).toBeInTheDocument())
  expect(screen.getByText('from 2 reviews')).toBeInTheDocument()
})

test('says how many reviews exist, not how many fitted on the page', async () => {
  // 20 shown of 41 — without this the reader would take 20 for the total.
  reviewsMock.mockResolvedValue({
    data: Array.from({ length: 20 }, (_, i) => review(`r${i}`)),
    total: 41,
  })
  render(<UserProfilePage />)
  await waitFor(() => expect(screen.getByText('showing 20 of 41')).toBeInTheDocument())
  expect(screen.getByText('from 41 reviews')).toBeInTheDocument()
})

test('does not caption a page that already holds every review', async () => {
  reviewsMock.mockResolvedValue({ data: [review('r1')], total: 1 })
  render(<UserProfilePage />)
  await waitFor(() => expect(screen.getByText('from 1 review')).toBeInTheDocument())
  expect(screen.queryByText(/showing/)).not.toBeInTheDocument()
})

test('an unrated stranger is said to be unrated, never scored', async () => {
  getMock.mockResolvedValue({ ...USER, review_score: null })
  reviewsMock.mockResolvedValue({ data: [], total: 0 })
  render(<UserProfilePage />)
  await waitFor(() => expect(screen.getByText('No reviews yet')).toBeInTheDocument())
  expect(screen.queryByRole('img', { name: /out of 5/ })).not.toBeInTheDocument()
})

test('offers a way to reach the reviews it says exist', async () => {
  // Naming a total the page cannot show is a taunt: every other list surface
  // on web pages with Load more, and the endpoint takes an offset.
  reviewsMock.mockResolvedValue({
    data: Array.from({ length: 20 }, (_, i) => review(`r${i}`)),
    total: 41,
  })
  render(<UserProfilePage />)
  const more = await screen.findByRole('button', { name: /Load more/ })

  reviewsMock.mockResolvedValue({ data: [review('r20')], total: 41 })
  await userEvent.click(more)

  // Asks for the NEXT page, by offset — never re-fetches page one.
  await waitFor(() =>
    expect(reviewsMock).toHaveBeenLastCalledWith({ id: 'u2' }, { limit: 20, offset: 20 }),
  )
  await waitFor(() => expect(screen.getByText('showing 21 of 41')).toBeInTheDocument())
})

test('offers no Load more once every review is on the page', async () => {
  reviewsMock.mockResolvedValue({ data: [review('r1')], total: 1 })
  render(<UserProfilePage />)
  await waitFor(() => expect(screen.getByText('from 1 review')).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument()
})

test('shows the stranger their completed work, in the third person', async () => {
  // The reputation signal this page exists to carry, from the aggregate rather
  // than from the reviews page beside it.
  reviewsMock.mockResolvedValue({ data: [], total: 0 })
  completedWorkMock.mockResolvedValue({ data: [{ category: 'delivery', count: 12 }] })
  render(<UserProfilePage />)

  // Await the COUNT, not the heading: the heading would also be on screen in a
  // half-rendered block, so waiting on it would let the count assertion race.
  expect(await screen.findByText('12')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Work completed' })).toBeInTheDocument()
  expect(completedWorkMock).toHaveBeenCalledWith({ id: 'u2' })
})

test('names an agent account as one, beside the name (#19)', async () => {
  // The page a human opens from a party card to check who they are dealing
  // with: the flag GET /v1/users/:id carries has to reach the screen here too.
  getMock.mockResolvedValue({ ...USER, first_name: 'Dispatch', last_name: 'Bot', is_agent: true })
  reviewsMock.mockResolvedValue({ data: [], total: 0 })
  render(<UserProfilePage />)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Dispatch Bot' })).toBeInTheDocument())
  expect(screen.getByText(AGENT_BADGE_LABEL)).toBeInTheDocument()
})

test('says nothing of the kind for a person', async () => {
  reviewsMock.mockResolvedValue({ data: [], total: 0 })
  render(<UserProfilePage />)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Grace Hopper' })).toBeInTheDocument())
  expect(screen.queryByText(AGENT_BADGE_LABEL)).not.toBeInTheDocument()
})

test('a stranger with no completed work gets no block at all', async () => {
  reviewsMock.mockResolvedValue({ data: [], total: 0 })
  completedWorkMock.mockResolvedValue({ data: [] })
  render(<UserProfilePage />)

  await waitFor(() => expect(screen.getByText('No reviews yet.')).toBeInTheDocument())
  expect(screen.queryByRole('heading', { name: /^Work/ })).not.toBeInTheDocument()
})
