/**
 * Profile presentation: ReviewCard tolerates the anonymous reviewer the
 * profile endpoint serves; StandingBadge renders completion/limited from
 * the cached standing read and expands the breakdown; RestrictionBanner
 * appears only under an active restriction; PersonCard reads "You" for
 * self and offers the contextual message link to others.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import type { MyStandingResponse, Review, UserStandingResponse } from '@tenda/shared'

const usersApi = vi.hoisted(() => ({
  standing: vi.fn<(p: { id: string }) => Promise<UserStandingResponse>>(),
  myStanding: vi.fn<() => Promise<MyStandingResponse>>(),
}))
vi.mock('@/api/client', () => ({ api: { users: usersApi } }))

import { ReviewCard, RestrictionBanner, StandingBadge } from '@/components/profile'
import { REVIEW_CARD_COPY } from '@/components/profile/ReviewCard'
import { PersonCard } from '@/components/shared/PersonCard'
import { useAuthStore } from '@/stores/auth.store'
import { makeUser } from '../../../test/factories/user'

const REVIEW: Review = {
  id: 'r1',
  escrow_id: 'e1',
  reviewer_id: 'them',
  reviewee_id: 'me',
  score: 4,
  comment: 'Great to work with',
  created_at: '2026-08-15T10:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: makeUser({ id: 'me' }), isAuthenticated: true })
})

test('ReviewCard: anonymous reviewer reads Counterparty; stars carry the score', () => {
  render(<ReviewCard review={REVIEW} />)
  expect(screen.getByText(REVIEW_CARD_COPY.counterparty)).toBeInTheDocument()
  expect(screen.getByLabelText(REVIEW_CARD_COPY.score(4))).toBeInTheDocument()
  expect(screen.getByText('Great to work with')).toBeInTheDocument()
})

test('ReviewCard: a reviewer with no name on file reads Anonymous, not an empty line', () => {
  render(<ReviewCard review={REVIEW} reviewer={{ first_name: null, last_name: null, avatar_url: null }} />)
  expect(screen.getByText(REVIEW_CARD_COPY.anonymous)).toBeInTheDocument()
})

test('ReviewCard: the "about" label is a neutral badge beside the name, and absent when there is none', () => {
  // The #60 preview sets the label as a badge on the name line, with the
  // score as one mono figure beside it — the row is scanned, not read.
  const { unmount } = render(<ReviewCard review={REVIEW} label="About the poster" />)
  const label = screen.getByText('About the poster')
  expect(label.className).toContain('rounded-full')
  expect(label.className).toContain('bg-surface-inset')
  expect(screen.getByLabelText('4 of 5 stars')).toHaveTextContent('★ 4.0')
  unmount()
  render(<ReviewCard review={REVIEW} />)
  expect(screen.queryByText('About the poster')).toBeNull()
})

test('StandingBadge: completion + Limited, expandable breakdown; New user below the floor', async () => {
  usersApi.standing.mockResolvedValue({
    completion_rate: 0.87,
    completed_count: 12,
    is_limited: true,
    review_score: '4.50',
    member_since: '2026-01-01T00:00:00.000Z',
  })
  render(<StandingBadge userId="user-a" />)
  const chip = await screen.findByRole('button', { name: /Standing: 87% completion, limited/ })
  await userEvent.click(chip)
  expect(screen.getByText('12')).toBeInTheDocument() // completed count in the breakdown

  usersApi.standing.mockResolvedValue({
    completion_rate: null,
    completed_count: 0,
    is_limited: false,
    review_score: null,
    member_since: null,
  })
  render(<StandingBadge userId="user-b" />)
  expect(await screen.findByRole('button', { name: 'Standing: New user' })).toBeInTheDocument()
})

test('RestrictionBanner: nothing in good standing; headline + reason when restricted', async () => {
  usersApi.myStanding.mockResolvedValue({
    completion_rate: 1,
    completed_count: 3,
    is_limited: false,
    restriction: null,
  })
  const { container } = render(<RestrictionBanner />)
  // A bare `await Promise.resolve()` yields ONE microtask — not enough to
  // settle the standing read, which then landed after the test finished and
  // updated an unmounted-but-unflushed tree outside act.
  await act(async () => {
    await Promise.resolve()
  })
  expect(container).toBeEmptyDOMElement()

  usersApi.myStanding.mockResolvedValue({
    completion_rate: 1,
    completed_count: 3,
    is_limited: true,
    restriction: { kind: 'create_cooldown', reason: 'Too many disputes', until: null },
  })
  render(<RestrictionBanner />)
  expect(await screen.findByText('Your account is restricted.')).toBeInTheDocument()
  expect(screen.getByText(/Too many disputes/)).toBeInTheDocument()
})

test('PersonCard: self reads You with no message link; others get the contextual chat link', async () => {
  usersApi.standing.mockResolvedValue({
    completion_rate: null,
    completed_count: 0,
    is_limited: false,
    review_score: null,
    member_since: null,
  })
  const me = { id: 'me', first_name: 'Ada', last_name: 'Okafor', avatar_url: null }
  const them = {
    id: 'them',
    first_name: 'Bola',
    last_name: 'Ade',
    avatar_url: null,
    review_score: '4.20',
    is_seeker: true,
  }

  render(<PersonCard user={me} label="Seller" currentUserId="me" />)
  expect(screen.getByText('You')).toBeInTheDocument()
  expect(screen.queryByLabelText(/Message/)).toBeNull()

  render(
    <PersonCard
      user={them}
      label="Buyer"
      currentUserId="me"
      context={{ id: 'e1', title: 'Trade: 5 USDC', kind: 'exchange' }}
    />,
  )
  const chat = screen.getByLabelText('Message Bola Ade')
  expect(chat).toHaveAttribute(
    'href',
    `/chat/them?escrowId=e1&escrowTitle=${encodeURIComponent('Trade: 5 USDC')}&kind=exchange`,
  )
  expect(screen.getByText(/★ 4.2/)).toBeInTheDocument()
  expect(screen.getByText(/· Seeker/)).toBeInTheDocument()

  // Two StandingBadges are still fetching when the assertions finish; without
  // this their reads land outside act. Nothing above depends on them — the
  // card's identity and link are synchronous.
  await act(async () => {
    await Promise.resolve()
  })
})

test('PersonCard: the standing chip renders for SELF too (mobile parity)', async () => {
  usersApi.standing.mockResolvedValue({
    completion_rate: 0.92,
    completed_count: 11,
    is_limited: false,
    review_score: null,
    member_since: null,
  })
  render(
    // Unique id: useStanding's module-level TTL cache would otherwise serve
    // the 'me' entry fetched (with a different mock) by the test above.
    <PersonCard
      user={{ id: 'me-self-standing', first_name: 'Ada', last_name: 'Okafor', avatar_url: null }}
      label="Seller"
      currentUserId="me-self-standing"
    />,
  )
  expect(await screen.findByRole('button', { name: /Standing: 92% completion/ })).toBeInTheDocument()
})
