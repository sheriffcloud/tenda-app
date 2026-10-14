/**
 * The dashboard's presentational blocks, each fed by props or a store: the
 * head, the announcement band, the attention rows, the ruled figures, the
 * account-health strip and the quick links.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BankAccountSummary, EscrowListRow, GigSummary } from '@tenda/shared'
import { EXCHANGE_STATUS_LABEL, formatDate, formatAssetAmount } from '@tenda/shared'
import { AccountHealthStrip, HEALTH_HREF } from '@/components/home/AccountHealthStrip'
import { AnnouncementBanner, ANNOUNCEMENTS_HREF } from '@/components/home/AnnouncementBanner'
import { AttentionRows } from '@/components/home/AttentionRows'
import { DashboardHeader, HOME_ACTION_HREF } from '@/components/home/DashboardHeader'
import { QUICK_HREF, QuickLinks } from '@/components/home/QuickLinks'
import { RuledFigures } from '@/components/home/RuledFigures'
import { attentionItems } from '@/components/home/attention'
import { HOME_COPY } from '@/components/home/copy'
import type { ProfileStats } from '@/hooks/profile/useProfileStats'
import { payoutMarketNames } from '@/lib/markets'
import { useNotificationsStore } from '@/stores/notifications.store'
import { deliveryGig, photoGig } from '@/e2e/fixtures/gigs'
import { makeUser } from '../../../test/factories/user'

afterEach(() => {
  vi.useRealTimers()
})

describe('DashboardHeader', () => {
  it('greets by first name for the hour, ends on the blue period, and offers the two actions', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 15, 0, 0))
    render(<DashboardHeader user={makeUser({ first_name: 'Adaeze' })} />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(`${HOME_COPY.greeting.afternoon}, Adaeze.`)
    expect(heading.querySelector('.text-brand-primary')).toHaveTextContent('.')
    expect(screen.getByText('Wednesday 2 September')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: HOME_COPY.actions.post })).toHaveAttribute('href', HOME_ACTION_HREF.post)
    expect(screen.getByRole('link', { name: HOME_COPY.actions.trade })).toHaveAttribute('href', HOME_ACTION_HREF.trade)
  })

  it('greets without a name while no user is loaded', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 20, 0, 0))
    render(<DashboardHeader user={null} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`${HOME_COPY.greeting.evening}.`)
  })

  it('greets without a name when none is on file — never "null"', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 8, 0, 0))
    render(<DashboardHeader user={makeUser({ first_name: '  ' })} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`${HOME_COPY.greeting.morning}.`)
    expect(document.body.textContent).not.toContain('null')
  })
})

describe('AnnouncementBanner', () => {
  beforeEach(() => {
    useNotificationsStore.getState().reset()
  })

  it('asks the store for the feed once while it is idle, and renders nothing without a broadcast', () => {
    const fetchFeed = vi.fn(async () => {})
    useNotificationsStore.setState({ fetchFeed })
    const { container } = render(<AnnouncementBanner />)
    expect(fetchFeed).toHaveBeenCalledTimes(1)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the HIGHEST-priority broadcast with a way to the centre, and does not refetch a settled feed', () => {
    const fetchFeed = vi.fn(async () => {})
    useNotificationsStore.setState({
      fetchFeed,
      feedStatus: 'ready',
      announcements: [
        { id: 'a1', title: 'Low', body: 'later', priority: 1, published_at: null, expires_at: null },
        { id: 'a2', title: 'Gas seeded on 0G', body: 'no native token needed', priority: 9, published_at: null, expires_at: null },
      ],
    })
    render(<AnnouncementBanner />)
    expect(fetchFeed).not.toHaveBeenCalled()
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Gas seeded on 0G')
    expect(banner).toHaveTextContent('no native token needed')
    expect(banner).not.toHaveTextContent('Low')
    expect(screen.getByRole('link', { name: HOME_COPY.announcement.read })).toHaveAttribute('href', ANNOUNCEMENTS_HREF)
  })
})

describe('AttentionRows', () => {
  it('renders nothing for an empty list — no heading over no work', () => {
    const { container } = render(<AttentionRows items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws each item as a link with its status, amount, posted time and closing date', () => {
    const applications: GigSummary = { ...photoGig, status: 'open', requires_approval: true, accept_deadline: '2026-09-05T18:00:00.000Z' }
    const items = attentionItems({
      posted: [{ ...deliveryGig, status: 'submitted' }, applications],
      working: [],
      trades: [],
      userId: 'me',
      copy: HOME_COPY.attention,
    })
    render(<AttentionRows items={items} />)
    const list = screen.getByRole('list', { name: HOME_COPY.attention.label })
    expect(list.querySelectorAll('a')).toHaveLength(2)
    const approve = screen.getByRole('link', { name: new RegExp(HOME_COPY.attention.approve(deliveryGig.title)) })
    expect(approve).toHaveAttribute('href', `/my-gigs/${deliveryGig.escrow_id}`)
    expect(approve).toHaveTextContent(formatAssetAmount(deliveryGig.amount_raw, deliveryGig.asset))
    expect(approve).toHaveTextContent('Submitted')
    expect(approve).not.toHaveTextContent(HOME_COPY.attention.acceptingUntil)
    const open = screen.getByRole('link', { name: new RegExp(HOME_COPY.attention.applications(photoGig.title)) })
    expect(open).toHaveTextContent(`${HOME_COPY.attention.acceptingUntil} ${formatDate(applications.accept_deadline)}`)
    expect(open).toHaveTextContent(HOME_COPY.attention.applicationsHint)
  })

  it('draws a trade waiting on my transfer with the EXCHANGE status and amount, at the trade', () => {
    const row: EscrowListRow = {
      id: 'x1', kind: 'exchange', status: 'accepted', chain_id: 'solana:devnet', asset: 'USDC_SOL', amount_raw: '150000000',
      title: null, fiat_currency: 'KES', creator_id: 'seller', counterparty_id: 'me', accept_deadline: null,
      created_at: '2026-09-01T10:00:00.000Z',
    }
    const items = attentionItems({ posted: [], working: [], trades: [row], userId: 'me', copy: HOME_COPY.attention })
    render(<AttentionRows items={items} />)
    const link = screen.getByRole('link', { name: new RegExp(HOME_COPY.attention.trade) })
    expect(link).toHaveAttribute('href', '/exchange/x1')
    expect(link).toHaveTextContent(formatAssetAmount(row.amount_raw, row.asset))
    // The exchange vocabulary, not the gig's: an accepted trade reads "In progress".
    expect(link).toHaveTextContent(EXCHANGE_STATUS_LABEL.accepted)
    expect(link).toHaveTextContent(HOME_COPY.attention.tradeHint)
  })
})

describe('RuledFigures', () => {
  const stats = (over: Partial<ProfileStats>): ProfileStats => ({
    posted: 12, active: 3, completed: 27, reviews: 19, status: 'ready', reload: vi.fn(), ...over,
  })

  it('prints the four figures and the score with its denominator once ready', () => {
    render(<RuledFigures stats={stats({})} reviewScore="4.80" />)
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('4.8')).toBeInTheDocument()
    expect(screen.getByText(HOME_COPY.figures.reviews(19))).toBeInTheDocument()
  })

  it('prints no number while loading, and says "unavailable" with a working retry on failure', async () => {
    const { unmount, container } = render(<RuledFigures stats={stats({ status: 'loading' })} reviewScore={null} />)
    expect(container.querySelector('[data-figures]')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('12')).toBeNull()
    unmount()
    const reload = vi.fn()
    render(<RuledFigures stats={stats({ status: 'error', reload })} reviewScore={null} />)
    expect(screen.getByText(HOME_COPY.figures.unavailable)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: HOME_COPY.figures.retry }))
    expect(reload).toHaveBeenCalledOnce()
  })

  it('shows the unrated mark, never 0.0, for a reader nobody has reviewed', () => {
    render(<RuledFigures stats={stats({ reviews: 0 })} reviewScore={null} />)
    expect(screen.getByText(HOME_COPY.figures.unrated)).toBeInTheDocument()
    expect(screen.queryByText('0.0')).toBeNull()
  })
})

describe('AccountHealthStrip', () => {
  const account = (over: Partial<BankAccountSummary>): BankAccountSummary => ({
    id: 'b1', country: 'ng', kind: 'bank', bank_code: '058', account_number_masked: '****1234',
    account_name: 'Ada', is_default: true, verified: true, created_at: '2026-08-01T00:00:00Z', ...over,
  })

  it('links each cell to its settings surface and summarises what the wire carries', () => {
    render(
      <AccountHealthStrip
        accounts={[account({}), account({ id: 'b2', country: 'KE' }), account({ id: 'b3', country: 'GH', verified: false })]}
        identities={[
          { kind: 'email', identifier: 'ada@tenda.test', email: 'ada@tenda.test', verified: true },
          { kind: 'google', identifier: 'g', email: null, verified: true },
          { kind: 'phone', identifier: '+234', email: null, verified: false },
        ]}
        walletCount={2}
        standing={{ completion_rate: 0.96, completed_count: 27, is_limited: false, restriction: null }}
      />,
    )
    expect(screen.getByRole('link', { name: /Payout accounts/ })).toHaveAttribute('href', HEALTH_HREF.payouts)
    expect(screen.getByRole('link', { name: /Payout accounts/ })).toHaveTextContent('2 verified · NG, KE')
    expect(screen.getByRole('link', { name: /Token approvals/ })).toHaveAttribute('href', HEALTH_HREF.approvals)
    expect(screen.getByRole('link', { name: /Sign-in methods/ })).toHaveTextContent('Email · Google · 2 wallets')
    expect(screen.getByRole('link', { name: /Standing/ })).toHaveTextContent('Good · 96% completion')
    expect(screen.getByRole('link', { name: /Standing/ })).toHaveAttribute('href', HEALTH_HREF.standing)
  })

  it('says Limited for a restricted account, New for one below the floor, and nothing while unknown', () => {
    const { unmount } = render(<AccountHealthStrip accounts={[]} identities={[]} walletCount={0} standing={{ completion_rate: null, completed_count: 0, is_limited: true, restriction: null }} />)
    expect(screen.getByRole('link', { name: /Standing/ })).toHaveTextContent(HOME_COPY.health.standingLimited)
    expect(screen.getByRole('link', { name: /Payout accounts/ })).toHaveTextContent('None verified')
    expect(screen.getByRole('link', { name: /Sign-in methods/ })).toHaveTextContent(HOME_COPY.health.signInEmpty)
    unmount()
    render(<AccountHealthStrip accounts={null} identities={[]} walletCount={1} standing={{ completion_rate: null, completed_count: 0, is_limited: false, restriction: null }} />)
    expect(screen.getByRole('link', { name: /Standing/ })).toHaveTextContent(HOME_COPY.health.standingNew)
    expect(screen.getByRole('link', { name: /Sign-in methods/ })).toHaveTextContent('1 wallet')
    expect(screen.getByRole('link', { name: /Payout accounts/ })).toHaveTextContent(HOME_COPY.health.pending)
  })

  it('shows the pending mark for sign-in methods that have not answered — never "add one" first', () => {
    // `identities` starts empty for EVERY account, so keying the cell on the
    // list alone told every email or phone reader to add a sign-in method
    // until the read landed — with the warning dot — and for good if it failed.
    render(<AccountHealthStrip accounts={[]} identities={null} walletCount={0} standing={null} />)
    const cell = screen.getByRole('link', { name: /Sign-in methods/ })
    expect(cell).toHaveTextContent(HOME_COPY.health.pending)
    expect(cell).not.toHaveTextContent(HOME_COPY.health.signInEmpty)
    expect(cell.querySelector('[aria-hidden]')).toBeNull()
  })

  it('shows the pending mark for a standing that has not answered', () => {
    render(<AccountHealthStrip accounts={[]} identities={[]} walletCount={0} standing={null} />)
    expect(screen.getByRole('link', { name: /Standing/ })).toHaveTextContent(HOME_COPY.health.pending)
  })
})

describe('HOME_COPY pluralisation', () => {
  it('reads one of a thing in the singular', () => {
    expect(HOME_COPY.figures.reviews(1)).toBe('/ 1 review')
    expect(HOME_COPY.wallet.linked(1)).toBe('1 wallet linked')
    expect(HOME_COPY.wallet.across(1)).toBe('USDC across 1 chain')
    expect(HOME_COPY.quick.trade.hint(1)).toBe('P2P · 1 fiat market')
    expect(HOME_COPY.quick.profile.hint('4.8', 1)).toBe('4.8 · 1 review · edit')
    expect(HOME_COPY.health.signInValue(['Email'], 1)).toBe('Email · 1 wallet')
  })
})

describe('QuickLinks', () => {
  it('links the four destinations with their live facts', () => {
    render(<QuickLinks openDisputes={0} reviewScore="4.80" reviews={19} />)
    expect(screen.getByRole('link', { name: /Post a gig/ })).toHaveAttribute('href', QUICK_HREF.post)
    expect(screen.getByRole('link', { name: /Buy \/ sell USDC/ })).toHaveTextContent(
      HOME_COPY.quick.trade.hint(payoutMarketNames().length),
    )
    expect(screen.getByRole('link', { name: /Disputes/ })).toHaveTextContent(HOME_COPY.quick.disputes.none)
    expect(screen.getByRole('link', { name: /Your profile/ })).toHaveTextContent('4.8 · 19 reviews · edit')
  })

  it('counts open disputes, shows no count before the answer, and invites an unrated profile to fill in', () => {
    const { unmount } = render(<QuickLinks openDisputes={2} reviewScore={null} reviews={0} />)
    expect(screen.getByRole('link', { name: /Disputes/ })).toHaveTextContent(HOME_COPY.quick.disputes.open(2))
    expect(screen.getByRole('link', { name: /Your profile/ })).toHaveTextContent(HOME_COPY.quick.profile.hint(null, 0))
    unmount()
    render(<QuickLinks openDisputes={null} reviewScore={null} reviews={0} />)
    expect(screen.getByRole('link', { name: /Disputes/ })).not.toHaveTextContent(/open/)
  })

  it('never puts "0 reviews" beside a score — the count is omitted until it has answered', () => {
    render(<QuickLinks openDisputes={0} reviewScore="4.80" reviews={null} />)
    const profile = screen.getByRole('link', { name: /Your profile/ })
    expect(profile).toHaveTextContent('4.8 · edit')
    expect(profile).not.toHaveTextContent(/review/)
  })
})
