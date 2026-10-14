/**
 * The dashboard's list cards: my gigs (tabbed), active trades, notifications
 * and messages — each the first few rows of a list another surface owns,
 * at the same address that surface uses.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EscrowListRow, GigSummary, MyApplication } from '@tenda/shared'
import { EXCHANGE_STATUS_LABEL, STATUS_LABEL, chainLabel, formatAssetAmount } from '@tenda/shared'
import { ActiveTradesCard, TRADE_HREF, TRADES_RECENT } from '@/components/home/ActiveTradesCard'
import { INBOX_HREF, MESSAGES_RECENT, MessagesCard } from '@/components/home/MessagesCard'
import { MY_GIGS_RECENT, MyGigsCard } from '@/components/home/MyGigsCard'
import { NOTIFICATIONS_HREF, NOTIFICATIONS_RECENT, NotificationsCard } from '@/components/home/NotificationsCard'
import { HOME_COPY } from '@/components/home/copy'
import { MY_GIGS_COPY } from '@/components/gig/my-gigs/copy'
import type { MyGigsState } from '@/hooks/gig/useMyGigs'
import type { PaginatedListState } from '@/hooks/pagination/usePaginatedList'
import { useChatStore } from '@/stores/chat.store'
import { useNotificationsStore } from '@/stores/notifications.store'
import { deliveryGig, photoGig } from '@/e2e/fixtures/gigs'

function list<T>(items: T[], over: Partial<PaginatedListState<T>> = {}): PaginatedListState<T> {
  return {
    items, total: items.length, hasMore: false, isLoading: false, isLoadingMore: false, isRefreshing: false,
    hasFetched: true, error: null, loadMore: vi.fn(), refresh: vi.fn(async () => {}), reload: vi.fn(async () => items.length),
    reconcile: vi.fn(async () => true), applyRealtimeItems: vi.fn(), ...over,
  }
}

const gig = (id: string, over: Partial<GigSummary> = {}): GigSummary => ({ ...deliveryGig, escrow_id: id, title: `Gig ${id}`, ...over })

describe('MyGigsCard', () => {
  const lists = (): MyGigsState => ({
    posted: list([gig('p1', { status: 'submitted' }), gig('p2'), gig('p3'), gig('p4'), gig('p5', { status: 'completed' })]),
    working: list([gig('w1', { status: 'accepted' })]),
    drafts: list([gig('d1', { status: 'draft' })]),
    applications: list<MyApplication>([
      { application: { id: 'a1', escrow_id: photoGig.escrow_id, applicant_id: 'me', message: '', wallet_address: 'SoLApplicantAddr11111111111111111111111111', status: 'open', expires_at: '2026-09-01T00:00:00Z', created_at: '2026-08-20T00:00:00Z' }, gig: photoGig },
    ]),
  })

  it('opens on Posted with counted tabs, shows the first rows only, and links "all" to the column', () => {
    render(<MyGigsCard lists={lists()} />)
    const tabs = screen.getByRole('tablist', { name: HOME_COPY.myGigs.title })
    expect(within(tabs).getByRole('tab', { name: /Posted/ })).toHaveAttribute('aria-selected', 'true')
    expect(within(tabs).getByRole('tab', { name: /Posted/ })).toHaveTextContent('5')
    expect(within(tabs).getByRole('tab', { name: /Drafts/ })).toHaveTextContent('1')
    const rows = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/my-gigs/'))
    expect(rows).toHaveLength(MY_GIGS_RECENT)
    expect(rows[0]).toHaveAttribute('href', '/my-gigs/p1')
    expect(rows[0]).toHaveTextContent(STATUS_LABEL.submitted)
    expect(rows[0]).toHaveTextContent(formatAssetAmount(deliveryGig.amount_raw, deliveryGig.asset))
    expect(rows[0]).toHaveTextContent(chainLabel(deliveryGig.chain_id))
    expect(screen.getByRole('link', { name: new RegExp(HOME_COPY.myGigs.all) })).toHaveAttribute('href', '/my-gigs')
  })

  it('switches to Working, Applied and Drafts, each at its own address', async () => {
    render(<MyGigsCard lists={lists()} />)
    await userEvent.click(screen.getByRole('tab', { name: /Working/ }))
    expect(screen.getByRole('link', { name: /Gig w1/ })).toHaveAttribute('href', '/my-gigs/w1?mine=working')
    expect(screen.getByRole('link', { name: new RegExp(HOME_COPY.myGigs.all) })).toHaveAttribute('href', '/my-gigs?mine=working')
    await userEvent.click(screen.getByRole('tab', { name: /Applied/ }))
    expect(screen.getByRole('link', { name: new RegExp(photoGig.title) })).toHaveAttribute('href', `/my-gigs/${photoGig.escrow_id}?mine=applications`)
    await userEvent.click(screen.getByRole('tab', { name: /Drafts/ }))
    expect(screen.getByRole('link', { name: /Gig d1/ })).toHaveAttribute('href', '/my-gigs/d1')
    expect(screen.getByRole('link', { name: new RegExp(HOME_COPY.myGigs.all) })).toHaveAttribute('href', MY_GIGS_COPY.draftsHref)
  })

  it('says "nothing here yet" for an empty Drafts tab — drafts have no column of their own', async () => {
    const empty = lists()
    empty.drafts = list([])
    render(<MyGigsCard lists={empty} />)
    await userEvent.click(screen.getByRole('tab', { name: /Drafts/ }))
    expect(screen.getByText(HOME_COPY.myGigs.empty)).toBeInTheDocument()
  })

  it('shows the list’s own empty words for a tab with nothing, and no count for one not yet fetched', async () => {
    const empty = lists()
    empty.working = list([], { hasFetched: false })
    render(<MyGigsCard lists={empty} />)
    expect(screen.getByRole('tab', { name: /Working/ })).not.toHaveTextContent(/\d/)
    await userEvent.click(screen.getByRole('tab', { name: /Working/ }))
    expect(screen.getByText(MY_GIGS_COPY.surface('working').emptyTitle)).toBeInTheDocument()
  })
})

describe('ActiveTradesCard', () => {
  const trade = (id: string, over: Partial<EscrowListRow> = {}): EscrowListRow => ({
    id, kind: 'exchange', status: 'accepted', chain_id: 'solana:devnet', asset: 'USDC_SOL', amount_raw: '150000000',
    title: null, fiat_currency: 'KES', creator_id: 'seller', counterparty_id: 'me', accept_deadline: null,
    created_at: '2026-09-01T10:00:00.000Z', ...over,
  })

  it('counts only trades in flight, draws them as money → currency with side and chain, at the trade’s address', () => {
    render(
      <ActiveTradesCard
        trades={list([
          trade('x1'),
          trade('x2', { status: 'completed' }),
          trade('x3', { status: 'open', creator_id: 'me', counterparty_id: null, amount_raw: '80000000', fiat_currency: 'NGN' }),
        ])}
        userId="me"
      />,
    )
    expect(screen.getByText(HOME_COPY.trades.inFlight(2))).toBeInTheDocument()
    const row = screen.getByRole('link', { name: /150 USDC/ })
    expect(row).toHaveAttribute('href', `${TRADE_HREF}/x1`)
    expect(row).toHaveTextContent('KES')
    expect(row).toHaveTextContent(HOME_COPY.trades.side.buying)
    expect(row).toHaveTextContent(EXCHANGE_STATUS_LABEL.accepted)
    expect(row).toHaveTextContent(chainLabel('solana:devnet'))
    expect(screen.getByRole('link', { name: /Your offer/ })).toHaveTextContent(HOME_COPY.trades.side.selling)
    expect(screen.queryByText(EXCHANGE_STATUS_LABEL.completed)).toBeNull()
    expect(screen.getByRole('link', { name: new RegExp(HOME_COPY.trades.more) })).toHaveAttribute('href', TRADE_HREF)
  })

  it('caps the rows, says so when nothing is in flight, and shows no pill before the list answers', () => {
    const many = Array.from({ length: TRADES_RECENT + 2 }, (_, i) => trade(`t${i}`))
    const { unmount } = render(<ActiveTradesCard trades={list(many)} userId="me" />)
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith(`${TRADE_HREF}/`))).toHaveLength(TRADES_RECENT)
    unmount()
    render(<ActiveTradesCard trades={list([], { hasFetched: false })} userId="me" />)
    expect(screen.getByText(HOME_COPY.trades.empty)).toBeInTheDocument()
    expect(screen.queryByText(HOME_COPY.trades.inFlight(0))).toBeNull()
  })
})

describe('NotificationsCard', () => {
  beforeEach(() => useNotificationsStore.getState().reset())

  it('shows the unread count and the latest notices, unread ones weighted, each at the centre', () => {
    useNotificationsStore.setState({
      unread: 3,
      notifications: [
        { id: 'n1', title: 'Proof submitted', body: 'Approve within 48h', data: null, read_at: null, created_at: '2026-09-02T10:00:00Z' },
        { id: 'n2', title: 'Escrow released', body: '21.45 USDC settled', data: null, read_at: '2026-09-01T00:00:00Z', created_at: '2026-09-01T10:00:00Z' },
      ],
    })
    render(<NotificationsCard />)
    expect(screen.getByText(HOME_COPY.notifications.unread(3))).toBeInTheDocument()
    const unread = screen.getByRole('link', { name: /Proof submitted/ })
    expect(unread).toHaveAttribute('href', `${NOTIFICATIONS_HREF}/n1`)
    expect(within(unread).getByText('Proof submitted').className).toContain('text-content-primary')
    expect(within(screen.getByRole('link', { name: /Escrow released/ })).getByText('Escrow released').className).toContain('text-content-secondary')
    expect(screen.getByRole('link', { name: HOME_COPY.notifications.all })).toHaveAttribute('href', NOTIFICATIONS_HREF)
  })

  it('shows only the latest few — the centre has the rest', () => {
    useNotificationsStore.setState({
      notifications: Array.from({ length: NOTIFICATIONS_RECENT + 2 }, (_, i) => ({
        id: `n${i}`, title: `Notice ${i}`, body: '', data: null, read_at: null, created_at: '2026-09-02T10:00:00Z',
      })),
    })
    render(<NotificationsCard />)
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith(`${NOTIFICATIONS_HREF}/`))).toHaveLength(NOTIFICATIONS_RECENT)
  })

  it('says nothing is new for an empty feed', () => {
    render(<NotificationsCard />)
    expect(screen.getByText(HOME_COPY.notifications.empty)).toBeInTheDocument()
    expect(screen.getByText(HOME_COPY.notifications.unread(0))).toBeInTheDocument()
  })
})

describe('MessagesCard', () => {
  beforeEach(() => useChatStore.getState().reset())

  it('lists the newest threads first with the other party and the last line, at the thread’s address', () => {
    useChatStore.setState({
      unread: 2,
      conversations: [
        { id: 'c-old', user_a_id: 'me', user_b_id: 'u1', status: 'active', closed_by: null, closed_at: null, last_message_at: '2026-09-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z', other_user: { id: 'u1', first_name: 'Tunde', last_name: 'O', avatar_url: null }, unread_count: 0, last_message: 'On my way' },
        { id: 'c-new', user_a_id: 'me', user_b_id: 'u2', status: 'active', closed_by: null, closed_at: null, last_message_at: '2026-09-02T00:00:00Z', created_at: '2026-08-02T00:00:00Z', other_user: { id: 'u2', first_name: 'Kwame', last_name: 'A', avatar_url: null }, unread_count: 1, last_message: 'Sent the details' },
      ],
    })
    render(<MessagesCard />)
    expect(screen.getByText(HOME_COPY.messages.unread(2))).toBeInTheDocument()
    const rows = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/chat/'))
    expect(rows.map((a) => a.getAttribute('href'))).toEqual(['/chat/u2', '/chat/u1'])
    expect(rows[0]).toHaveTextContent('Kwame A')
    expect(rows[0]).toHaveTextContent('Sent the details')
    expect(screen.getByRole('link', { name: HOME_COPY.messages.inbox })).toHaveAttribute('href', INBOX_HREF)
  })

  it('shows only the latest few threads — the inbox has the rest', () => {
    useChatStore.setState({
      conversations: Array.from({ length: MESSAGES_RECENT + 2 }, (_, i) => ({
        id: `c${i}`, user_a_id: 'me', user_b_id: `u${i}`, status: 'active' as const, closed_by: null, closed_at: null,
        last_message_at: `2026-09-0${i + 1}T00:00:00Z`, created_at: '2026-08-01T00:00:00Z',
        other_user: { id: `u${i}`, first_name: 'User', last_name: String(i), avatar_url: null }, unread_count: 0, last_message: 'hi',
      })),
    })
    render(<MessagesCard />)
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/chat/'))).toHaveLength(MESSAGES_RECENT)
  })

  it('orders a thread with no message yet by its creation, and draws no subtitle for it', () => {
    useChatStore.setState({
      unread: 0,
      conversations: [
        { id: 'c-said', user_a_id: 'me', user_b_id: 'u1', status: 'active', closed_by: null, closed_at: null, last_message_at: '2026-08-15T00:00:00Z', created_at: '2026-08-01T00:00:00Z', other_user: { id: 'u1', first_name: 'Tunde', last_name: 'O', avatar_url: null }, unread_count: 0, last_message: 'On my way' },
        { id: 'c-new', user_a_id: 'me', user_b_id: 'u2', status: 'active', closed_by: null, closed_at: null, last_message_at: null, created_at: '2026-09-02T00:00:00Z', other_user: { id: 'u2', first_name: 'Kwame', last_name: 'A', avatar_url: null }, unread_count: 0, last_message: null },
      ],
    })
    render(<MessagesCard />)
    const rows = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/chat/'))
    expect(rows.map((a) => a.getAttribute('href'))).toEqual(['/chat/u2', '/chat/u1'])
    expect(rows[0]).toHaveTextContent('Kwame A')
    expect(rows[0]).not.toHaveTextContent('On my way')
  })

  it('keeps a long last message to ONE line — it is text somebody else wrote', () => {
    const essay = 'word '.repeat(400).trim()
    useChatStore.setState({
      conversations: [{
        id: 'c-long', user_a_id: 'me', user_b_id: 'u9', status: 'active', closed_by: null, closed_at: null,
        last_message_at: '2026-09-02T00:00:00Z', created_at: '2026-08-02T00:00:00Z',
        other_user: { id: 'u9', first_name: 'Long', last_name: 'Writer', avatar_url: null }, unread_count: 0, last_message: essay,
      }],
    })
    render(<MessagesCard />)
    const line = screen.getByText(essay)
    expect(line.className).toContain('truncate')
    expect(line.className).toContain('min-w-0')
  })

  it('says so when there is no conversation yet', () => {
    render(<MessagesCard />)
    expect(screen.getByText(HOME_COPY.messages.empty)).toBeInTheDocument()
  })
})
