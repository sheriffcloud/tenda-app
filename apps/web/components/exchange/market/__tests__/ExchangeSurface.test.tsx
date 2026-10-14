/**
 * The order book as a screen: which list is showing, what the filters write to
 * the URL, and what each of the four states actually SAYS.
 *
 * The state copy is the part worth pinning. "Nobody is quoting the market" is
 * false for someone whose currency chip is set, and "nothing new" is false for
 * someone whose request failed — the #17 review found both of those shapes on
 * other surfaces, and this is where they would recur.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EscrowListRow, ExchangeSummary } from '@tenda/shared'
import type { PaginatedListState } from '@/hooks/pagination/usePaginatedList'
import { EXCHANGE_COPY, ExchangeSurface, type ExchangeRouteState } from '@/components/exchange/market'
import { makeExchangeDetail } from '../../../../test/factories/exchange'

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/exchange',
}))

// The chain row reads the registry; one chain and no filter means it renders
// nothing, which keeps these assertions about the currency chips.
vi.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: (select: (s: { chains: null; ensureLoaded: () => void }) => unknown) =>
    select({ chains: null, ensureLoaded: () => undefined }),
}))

function listState<T>(over: Partial<PaginatedListState<T>> = {}): PaginatedListState<T> {
  return {
    items: [],
    total: 0,
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    isRefreshing: false,
    hasFetched: true,
    error: null,
    loadMore: vi.fn(),
    refresh: vi.fn(async () => {}),
    reload: vi.fn(async () => 0),
    reconcile: vi.fn(async () => true),
    applyRealtimeItems: vi.fn(),
    ...over,
  }
}

const ROUTE: ExchangeRouteState = { tab: 'market', currency: null, chainId: null }

function renderSurface(
  route: Partial<ExchangeRouteState> = {},
  market: Partial<PaginatedListState<ExchangeSummary>> = {},
  myTrades: Partial<PaginatedListState<EscrowListRow>> = {},
) {
  return render(
    <ExchangeSurface
      route={{ ...ROUTE, ...route }}
      screen={{
        market: listState<ExchangeSummary>(market),
        myTrades: listState<EscrowListRow>(myTrades),
      }}
      userId="me"
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ExchangeSurface — the two lists', () => {
  it('titles the surface per tab, and the market lists offers', () => {
    renderSurface({}, { items: [makeExchangeDetail()], total: 1 })
    expect(
      screen.getByRole('heading', { level: 1, name: EXCHANGE_COPY.title('market') }),
    ).toBeInTheDocument()
    const list = screen.getByRole('list', { name: EXCHANGE_COPY.market.label })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows the reader’s own trades on the other tab', () => {
    renderSurface(
      { tab: 'mine' },
      {},
      {
        items: [
          {
            id: 'exch-9',
            kind: 'exchange',
            status: 'open',
            chain_id: 'solana:devnet',
            asset: 'USDC_SOL',
            amount_raw: '50000000',
            title: null,
            fiat_currency: 'NGN',
            creator_id: 'me',
            counterparty_id: null,
            accept_deadline: null,
            created_at: '2026-08-15T12:00:00.000Z',
          },
        ],
        total: 1,
      },
    )
    expect(
      screen.getByRole('heading', { level: 1, name: EXCHANGE_COPY.title('mine') }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: EXCHANGE_COPY.mine.label })).toBeInTheDocument()
  })

  it('counts what the ACTIVE list holds, and only once it has answered', () => {
    const { rerender } = renderSurface({}, { total: 4, hasFetched: false })
    expect(screen.queryByText(EXCHANGE_COPY.count(4, null))).toBeNull()

    rerender(
      <ExchangeSurface
        route={ROUTE}
        screen={{
          market: listState<ExchangeSummary>({ total: 4 }),
          myTrades: listState<EscrowListRow>(),
        }}
        userId="me"
      />,
    )
    expect(screen.getByText(EXCHANGE_COPY.count(4, null))).toBeInTheDocument()
  })

  it('names the currency in the count when one is filtering', () => {
    renderSurface({ currency: 'KES' }, { total: 2 })
    expect(screen.getByText(EXCHANGE_COPY.count(2, 'KES'))).toBeInTheDocument()
  })
})

describe('ExchangeSurface — states', () => {
  it('shows a shimmer of the rows to come, not a bare spinner', () => {
    const { container } = renderSurface({}, { hasFetched: false })
    expect(container.querySelector('.animate-shimmer')).not.toBeNull()
    expect(screen.queryByText(EXCHANGE_COPY.market.emptyTitle(false))).toBeNull()
  })

  it('says a FAILED read failed, and that nothing of the reader’s moved', () => {
    renderSurface({}, { error: 'offer index down' })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText(EXCHANGE_COPY.market.errorTitle)).toBeInTheDocument()
    expect(within(alert).getByText(EXCHANGE_COPY.market.errorBody)).toBeInTheDocument()
    expect(screen.queryByText(EXCHANGE_COPY.market.emptyTitle(false))).toBeNull()
  })

  it('retries the read from the failure itself', async () => {
    const refresh = vi.fn(async () => {})
    renderSurface({}, { error: 'boom', refresh })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps rows on screen when a REFRESH fails behind them', () => {
    renderSurface({}, { error: 'boom', items: [makeExchangeDetail()], total: 1 })
    expect(screen.getByRole('list', { name: EXCHANGE_COPY.market.label })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('blames the FILTER when one is set, and nobody when none is', () => {
    const { rerender } = renderSurface({ currency: 'GHS' })
    expect(screen.getByText(EXCHANGE_COPY.market.emptyTitle(true))).toBeInTheDocument()
    expect(screen.getByText(EXCHANGE_COPY.market.emptyBody('GHS', null))).toBeInTheDocument()

    rerender(
      <ExchangeSurface
        route={ROUTE}
        screen={{ market: listState<ExchangeSummary>(), myTrades: listState<EscrowListRow>() }}
        userId="me"
      />,
    )
    expect(screen.getByText(EXCHANGE_COPY.market.emptyTitle(false))).toBeInTheDocument()
    expect(screen.getByText(EXCHANGE_COPY.market.emptyUnfilteredBody)).toBeInTheDocument()
  })

  it('names the filter that is actually set, and no other', () => {
    // A reader who set only a currency was being told to "clear the chain
    // filter" — and on a single-chain deployment that row is not rendered at
    // all, so the advice pointed at a control that was not on the screen.
    const { rerender } = renderSurface({ currency: 'GHS' })
    expect(screen.getByText(/Try another one/)).toBeInTheDocument()
    expect(screen.queryByText(/chain filter/)).toBeNull()

    rerender(
      <ExchangeSurface
        route={{ ...ROUTE, chainId: 'solana:devnet' }}
        screen={{ market: listState<ExchangeSummary>(), myTrades: listState<EscrowListRow>() }}
        userId="me"
      />,
    )
    expect(screen.getByText(EXCHANGE_COPY.market.emptyBody(null, 'solana:devnet'))).toBeInTheDocument()

    rerender(
      <ExchangeSurface
        route={{ tab: 'market', currency: 'GHS', chainId: 'solana:devnet' }}
        screen={{ market: listState<ExchangeSummary>(), myTrades: listState<EscrowListRow>() }}
        userId="me"
      />,
    )
    expect(
      screen.getByText(EXCHANGE_COPY.market.emptyBody('GHS', 'solana:devnet')),
    ).toBeInTheDocument()
  })

  it('explains the ordering only when there are rows to order', () => {
    const { rerender } = renderSurface({}, { items: [makeExchangeDetail()], total: 1 })
    expect(screen.getByText(EXCHANGE_COPY.ordering)).toBeInTheDocument()

    rerender(
      <ExchangeSurface
        route={ROUTE}
        screen={{ market: listState<ExchangeSummary>(), myTrades: listState<EscrowListRow>() }}
        userId="me"
      />,
    )
    expect(screen.queryByText(EXCHANGE_COPY.ordering)).toBeNull()
  })
})

describe('ExchangeSurface — the control row', () => {
  it('makes the tabs LINKS, each with its own address', () => {
    renderSurface()
    expect(screen.getByRole('link', { name: 'Market' })).toHaveAttribute('href', '/exchange')
    expect(screen.getByRole('link', { name: 'My trades' })).toHaveAttribute(
      'href',
      '/exchange?tab=mine',
    )
  })

  it('marks the open tab for assistive tech, not only with colour', () => {
    renderSurface({ tab: 'mine' })
    expect(screen.getByRole('link', { name: 'My trades' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Market' })).not.toHaveAttribute('aria-current')
  })

  it('carries the filters ACROSS a tab switch', () => {
    renderSurface({ currency: 'NGN', chainId: 'solana:devnet' })
    expect(screen.getByRole('link', { name: 'My trades' })).toHaveAttribute(
      'href',
      '/exchange?tab=mine&cur=NGN&chain=solana%3Adevnet',
    )
  })

  it('writes a currency chip with REPLACE — a filter is not a place', async () => {
    renderSurface()
    await userEvent.click(screen.getByRole('button', { name: '₦ NGN' }))
    expect(replace).toHaveBeenCalledWith('/exchange?cur=NGN')
  })

  it('offers a way back to all currencies, pressed when nothing filters', () => {
    renderSurface()
    expect(screen.getByRole('button', { name: EXCHANGE_COPY.allCurrencies })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('hides the currency chips on My trades, where they would steer nothing', () => {
    // The list there is escrows, filtered by chain and kind — there is no
    // currency parameter on that wire, so a chip would be a dead control.
    renderSurface({ tab: 'mine' })
    expect(screen.queryByRole('button', { name: '₦ NGN' })).toBeNull()
  })
})

describe('ExchangeSurface — My trades is filtered too', () => {
  it('blames the CHAIN filter for an empty trade list, because it narrows that list', () => {
    // `useExchangeScreen` passes chain_id to /v1/users/:id/escrows, so a reader
    // whose trades are all on another chain is looking at a filtered empty
    // list — not at an account with no trades. Telling them "no trades yet"
    // is the market half's bug on the other half of the same component.
    renderSurface({ tab: 'mine', chainId: 'solana:devnet' })
    expect(screen.getByText(EXCHANGE_COPY.mine.emptyTitle(true))).toBeInTheDocument()
    expect(screen.getByText(EXCHANGE_COPY.mine.emptyBody(true))).toBeInTheDocument()
  })

  it('does NOT blame the currency chip, which cannot narrow that list', () => {
    // There is no currency parameter on the escrows wire — the chips are even
    // hidden on this tab. Blaming `?cur=` would be a second false statement.
    renderSurface({ tab: 'mine', currency: 'NGN' })
    expect(screen.getByText(EXCHANGE_COPY.mine.emptyTitle(false))).toBeInTheDocument()
    expect(screen.getByText(EXCHANGE_COPY.mine.emptyBody(false))).toBeInTheDocument()
  })
})
