/**
 * WalletScreen — the dumb switch over `section`, plus the feed rendering
 * through the shared per-side tx copy (the poster reads "Payout released",
 * the worker "Gig payout", amounts signed from the viewer's seat).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { formatRelativeDayWithTime, groupByDay, type UserEscrowTransaction } from '@tenda/shared'
import { WALLET_COPY } from '@/components/wallet/copy'
import { WALLET_HERO_COPY } from '@/components/wallet/WalletHeroCard'

const hookState = {
  user: { id: 'worker-1' } as { id: string } | null,
  section: 'ready' as string,
  retryWallets: vi.fn(),
  retryChains: vi.fn(),
  balances: [] as unknown[],
  totalUsdc: 50,
  totalTransactions: 0,
  earnedUsdc: 80,
  spentUsdc: 30,
  feed: [] as unknown[],
  loadMoreTransactions: vi.fn(),
  hasMoreTransactions: false,
  isLoadingMoreTransactions: false,
  isLoading: false,
  isLoadingTransactions: false,
  refreshing: false,
  handleRefresh: vi.fn(async () => {}),
}
vi.mock('@/hooks/wallet/useWalletScreen', () => ({ useWalletScreen: () => hookState }))

import { WalletScreen } from '@/components/wallet/WalletScreen'

function tx(over: Partial<UserEscrowTransaction>): UserEscrowTransaction {
  return {
    id: 't1',
    escrow_id: 'e1',
    type: 'approve',
    tx_ref: 'sig',
    amount_raw: '48500000',
    platform_fee_raw: null,
    creator_payout_raw: null,
    actor_id: null,
    winner: null,
    created_at: '2026-08-15T09:00:00Z',
    escrow: {
      id: 'e1',
      kind: 'gig',
      title: 'Fix my sink',
      amount_raw: '50000000',
      asset: 'USDC_SOL',
      chain_id: 'solana:devnet',
      status: 'completed',
      creator_id: 'creator-1',
      counterparty_id: 'worker-1',
    },
    ...over,
  }
}

beforeEach(() => {
  hookState.section = 'ready'
  hookState.user = { id: 'worker-1' }
  hookState.feed = []
  hookState.isLoading = false
})

describe('the activity feed’s states', () => {
  it('a feed that is still LOADING never claims there is no activity', () => {
    // The lie this app has now fixed on the gig feed and the notification
    // centre: "nothing here" is not the same answer as "not read yet".
    hookState.section = 'ready'
    hookState.feed = []
    hookState.isLoadingTransactions = true
    const { container } = render(<WalletScreen />)
    expect(screen.queryByText(WALLET_COPY.emptyTitle)).toBeNull()
    expect(container.querySelector('.animate-shimmer')).not.toBeNull()
  })

  it('counts what the SERVER holds, and only once it has answered', () => {
    hookState.section = 'ready'
    hookState.feed = []
    hookState.isLoadingTransactions = true
    hookState.totalTransactions = 12
    const loading = render(<WalletScreen />)
    expect(screen.queryByText(WALLET_COPY.count(12))).toBeNull()
    loading.unmount()

    hookState.isLoadingTransactions = false
    render(<WalletScreen />)
    expect(screen.getByText(WALLET_COPY.count(12))).toBeInTheDocument()
  })
})

describe('the header', () => {
  it('says "Wallet" ONCE — an eyebrow above an identical h1 is noise', () => {
    hookState.section = 'ready'
    render(<WalletScreen />)
    expect(screen.getAllByText(WALLET_COPY.title)).toHaveLength(1)
  })
})

describe('section switch', () => {
  it('ready renders the USDC headline and lifetime totals', () => {
    render(<WalletScreen />)
    expect(screen.getByText(WALLET_HERO_COPY.total)).toBeInTheDocument()
    expect(screen.getByText('50.00')).toBeInTheDocument()
    expect(screen.getByText('+ 80.00')).toBeInTheDocument()
    expect(screen.getByText('− 30.00')).toBeInTheDocument()
    expect(screen.getByText(`${WALLET_HERO_COPY.unit} · ${WALLET_HERO_COPY.lifetime}`)).toBeInTheDocument()
  })

  it('no-wallet invites linking, never a zero balance', () => {
    hookState.section = 'no-wallet'
    render(<WalletScreen />)
    expect(screen.getByRole('link', { name: 'Link a wallet' })).toHaveAttribute(
      'href',
      '/settings/linked-wallets',
    )
    expect(screen.queryByText('50.00')).toBeNull()
  })

  it('wallets-error and balances-unavailable each get their OWN retry', async () => {
    hookState.section = 'wallets-error'
    const first = render(<WalletScreen />)
    await userEvent.click(screen.getByRole('button', { name: WALLET_COPY.retry }))
    expect(hookState.retryWallets).toHaveBeenCalled()
    first.unmount()

    hookState.section = 'balances-unavailable'
    render(<WalletScreen />)
    await userEvent.click(screen.getByRole('button', { name: WALLET_COPY.retry }))
    expect(hookState.retryChains).toHaveBeenCalled()
  })

  it('loading shows the hero skeleton, not a confident 0.00', () => {
    hookState.section = 'loading'
    render(<WalletScreen />)
    expect(screen.getByTestId('hero-skeleton')).toBeInTheDocument()
    expect(screen.queryByText('0.00')).toBeNull()
  })
})

/** The formatted stamp can contain regex-special characters (e.g. a dot in "a.m."). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('feed (shared per-side copy)', () => {
  it('words the payout from the WORKER’s side with a credited amount', () => {
    hookState.feed = groupByDay([tx({})], (t) => t.created_at, (t) => t.id, 'tx')
    render(<WalletScreen />)
    expect(screen.getByText('Gig payout')).toBeInTheDocument()
    expect(screen.getByText(/\+48\.5 USDC/)).toBeInTheDocument()
  })

  it('words the same row from the POSTER’s side, uncredited', () => {
    hookState.user = { id: 'creator-1' }
    hookState.feed = groupByDay([tx({})], (t) => t.created_at, (t) => t.id, 'tx')
    render(<WalletScreen />)
    expect(screen.getByText('Payout released')).toBeInTheDocument()
    expect(screen.queryByText(/\+48\.5/)).toBeNull()
  })

  it('stamps every row with when it happened', () => {
    // Unconditional since #38 (escrow_transactions.created_at is NOT NULL).
    // Compared against the shared formatter's own output so the assertion
    // proves the row rendered THIS transaction's instant, not merely some text.
    hookState.feed = groupByDay([tx({})], (t) => t.created_at, (t) => t.id, 'tx')
    render(<WalletScreen />)
    const stamp = formatRelativeDayWithTime('2026-08-15T09:00:00Z')
    expect(screen.getByText(new RegExp(escapeRegExp(stamp)))).toBeInTheDocument()
  })

  it('shows a funding row as a DEBIT to the poster who paid it', () => {
    // The only path to a '-' sign: `create` seen by the creator. Every other
    // row in this file is a credit or unsigned, so the negative styling branch
    // had never been rendered.
    hookState.user = { id: 'creator-1' }
    hookState.feed = groupByDay([tx({ type: 'create' })], (t) => t.created_at, (t) => t.id, 'tx')
    render(<WalletScreen />)
    // Anchored: the row also renders an ISO date, which is full of hyphens.
    const amount = screen.getByText(/^-\d/)
    expect(amount).toBeInTheDocument()
    expect(amount).toHaveClass('text-numeric-negative')
  })

  it('names an exchange row "Exchange", because that wire carries no title', () => {
    // `escrow.title` is gig_details.title and is NULL for every exchange — the
    // same wire fact MyTradeCard exists for. Without the fallback the row would
    // headline nothing at all.
    hookState.feed = groupByDay(
      [tx({ escrow: { ...tx({}).escrow, kind: 'exchange', title: null } })],
      (t) => t.created_at,
      (t) => t.id,
      'tx',
    )
    render(<WalletScreen />)
    expect(screen.getByText(/Exchange/)).toBeInTheDocument()
  })

  it('an empty feed says so as a panel, not as a sentence where rows go', () => {
    render(<WalletScreen />)
    expect(screen.getByText(WALLET_COPY.emptyTitle)).toBeInTheDocument()
    expect(screen.getByText(WALLET_COPY.emptyBody)).toBeInTheDocument()
  })

  it('offers Load more only while more pages exist, disabled mid-load', async () => {
    hookState.feed = groupByDay([tx({})], (t) => t.created_at, (t) => t.id, 'tx')
    hookState.hasMoreTransactions = true
    const first = render(<WalletScreen />)
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(hookState.loadMoreTransactions).toHaveBeenCalledTimes(1)
    first.unmount()

    hookState.isLoadingMoreTransactions = true
    render(<WalletScreen />)
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled()
    hookState.hasMoreTransactions = false
    hookState.isLoadingMoreTransactions = false
  })
})
