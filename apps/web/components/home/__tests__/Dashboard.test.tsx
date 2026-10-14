/**
 * The composed dashboard: every section present, fed by the hooks the other
 * surfaces already run — and, correction (d), NEVER the open feed.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { GigSummary } from '@tenda/shared'
import { HOME_COPY } from '@/components/home'
import { useAuthStore } from '@/stores/auth.store'
import { useChatStore } from '@/stores/chat.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { deliveryGig } from '@/e2e/fixtures/gigs'
import { makeUser } from '../../../test/factories/user'

const list = <T,>(items: T[]) => ({
  items, total: items.length, hasMore: false, isLoading: false, isLoadingMore: false, isRefreshing: false,
  hasFetched: true, error: null, loadMore: vi.fn(), refresh: vi.fn(async () => {}), reload: vi.fn(async () => items.length),
  reconcile: vi.fn(async () => true), applyRealtimeItems: vi.fn(),
})

const seams = vi.hoisted(() => ({
  posted: [] as GigSummary[],
  loadMethods: vi.fn(async () => {}),
  statsStatus: 'ready' as 'ready' | 'loading' | 'error',
  disputesFetched: true,
}))
vi.mock('@/hooks/gig/useMyGigs', () => ({
  useMyGigs: () => ({ posted: list(seams.posted), working: list([]), drafts: list([]), applications: list([]) }),
}))
vi.mock('@/hooks/exchange/useMyTrades', () => ({ useMyTrades: () => list([]) }))
vi.mock('@/hooks/dispute/useMyDisputes', () => ({
  useMyDisputes: () => ({ ...list([]), hasFetched: seams.disputesFetched, total: 2 }),
}))
vi.mock('@/hooks/fiat/usePayoutAccounts', () => ({
  usePayoutAccounts: () => ({ accounts: [], selectedId: null, setSelectedId: vi.fn(), selected: null, reload: vi.fn() }),
}))
vi.mock('@/hooks/profile/useProfileStats', () => ({
  useProfileStats: () => ({
    posted: 12, active: 3, completed: 27, reviews: seams.statsStatus === 'ready' ? 19 : 0, status: seams.statsStatus, reload: vi.fn(),
  }),
}))
vi.mock('@/hooks/profile/useStanding', () => ({
  useMyStanding: () => ({ completion_rate: 0.96, completed_count: 27, is_limited: false, restriction: null }),
}))
vi.mock('@/hooks/wallet/useWalletScreen', () => ({
  useWalletScreen: () => ({
    section: 'no-wallet', balances: [], totalUsdc: 0, earnedUsdc: 0, spentUsdc: 0, isLoading: false, retryWallets: vi.fn(),
  }),
}))

import { Dashboard } from '@/components/home'

beforeEach(() => {
  seams.posted = [{ ...deliveryGig, status: 'submitted' }]
  seams.statsStatus = 'ready'
  seams.disputesFetched = true
  seams.loadMethods.mockClear()
  useAuthStore.setState({
    user: makeUser({ id: 'me', first_name: 'Adaeze', review_score: '4.80' }),
    wallets: [],
    identities: [],
    identitiesStatus: 'ready',
    loadMethods: seams.loadMethods,
  })
  useNotificationsStore.setState({ feedStatus: 'ready', announcements: [], notifications: [], unread: 0 })
  useChatStore.setState({ conversations: [], unread: 0 })
})

it('composes every section of the preview, in order, from the reader’s own data', () => {
  render(<Dashboard />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Adaeze')
  expect(screen.getByRole('list', { name: HOME_COPY.attention.label })).toHaveTextContent(
    HOME_COPY.attention.approve(deliveryGig.title),
  )
  expect(screen.getByText('27')).toBeInTheDocument()
  for (const title of [
    HOME_COPY.myGigs.title,
    HOME_COPY.trades.title,
    HOME_COPY.wallet.title,
    HOME_COPY.notifications.title,
    HOME_COPY.messages.title,
  ]) {
    expect(screen.getByRole('region', { name: title })).toBeInTheDocument()
  }
  expect(screen.getByRole('navigation', { name: 'Account health' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Quick links' })).toBeInTheDocument()
  // Top to bottom, as the preview draws them.
  const order = [
    screen.getByRole('heading', { level: 1 }),
    screen.getByRole('list', { name: HOME_COPY.attention.label }),
    screen.getByRole('region', { name: HOME_COPY.myGigs.title }),
    screen.getByRole('region', { name: HOME_COPY.wallet.title }),
    screen.getByRole('navigation', { name: 'Account health' }),
    screen.getByRole('navigation', { name: 'Quick links' }),
  ]
  for (let i = 1; i < order.length; i += 1) {
    expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
})

it('hands the profile quick link a review count only once the stats are READY', () => {
  const { unmount } = render(<Dashboard />)
  expect(screen.getByRole('link', { name: /Your profile/ })).toHaveTextContent('19 reviews')
  unmount()
  seams.statsStatus = 'loading'
  render(<Dashboard />)
  // The hook zeroes its figures while loading; the link must not say so.
  expect(screen.getByRole('link', { name: /Your profile/ })).not.toHaveTextContent(/review/)
  expect(screen.getByRole('link', { name: /Your profile/ })).toHaveTextContent('4.8')
})

it('counts open disputes on the quick link only once the list has answered', () => {
  const { unmount } = render(<Dashboard />)
  expect(screen.getByRole('link', { name: /Disputes/ })).toHaveTextContent(HOME_COPY.quick.disputes.open(2))
  unmount()
  seams.disputesFetched = false
  render(<Dashboard />)
  expect(screen.getByRole('link', { name: /Disputes/ })).not.toHaveTextContent(/open/)
})

it('never shows the open-gigs feed — no list column, no "Open gigs"', () => {
  render(<Dashboard />)
  expect(document.querySelector('[data-list]')).toBeNull()
  expect(screen.queryByText('Open gigs')).toBeNull()
})

it('asks for the sign-in methods once while nothing has, and shows the cell PENDING until they answer', () => {
  useAuthStore.setState({ identitiesStatus: 'idle' })
  const { unmount } = render(<Dashboard />)
  expect(seams.loadMethods).toHaveBeenCalledTimes(1)
  const cell = () => screen.getByRole('link', { name: /Sign-in methods/ })
  expect(cell()).toHaveTextContent(HOME_COPY.health.pending)
  expect(cell()).not.toHaveTextContent(HOME_COPY.health.signInEmpty)
  unmount()
  useAuthStore.setState({
    identities: [{ kind: 'email', identifier: 'a', email: 'a', verified: true }],
    identitiesStatus: 'ready',
  })
  render(<Dashboard />)
  expect(seams.loadMethods).toHaveBeenCalledTimes(1)
  expect(cell()).toHaveTextContent('Email')
})

it('says "add a sign-in method" only once the list has ANSWERED empty', () => {
  // ready + [] + no wallet is the one honest case for that line; an idle or
  // failed read is not. (No reader can actually reach it — they signed in
  // somehow — but the rule is what keeps the pending case from lying.)
  useAuthStore.setState({ identities: [], identitiesStatus: 'ready', wallets: [] })
  render(<Dashboard />)
  expect(screen.getByRole('link', { name: /Sign-in methods/ })).toHaveTextContent(HOME_COPY.health.signInEmpty)
  // Answered is answered: an empty list is not a reason to ask again.
  expect(seams.loadMethods).not.toHaveBeenCalled()
})
