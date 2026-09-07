/**
 * The two exchange routes' own decisions: the registry-verified chain filter,
 * and the split between an offer that is GONE and one that merely failed to
 * load. The book itself is open to every signed-in user (#50).
 *
 * That split is the point of this file. Collapsing them sends a reader back to
 * the order book for an offer that is still there and still theirs to take.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DetailLoadError, ExchangeDetail } from '@tenda/shared'
import ExchangePage from '@/app/(app)/exchange/page'
import { ExchangeDetailRoute } from '@/components/exchange/ExchangeDetailRoute'
import { EXCHANGE_COPY } from '@/components/exchange/market'
import { OFFER_DETAIL_COPY } from '@/components/exchange/detail'
import { sellHref } from '@/components/wallet/sell/copy'
import { useAuthStore } from '@/stores/auth.store'
import { makeUser } from '../../../../test/factories/user'
import { makeExchangeDetail } from '../../../../test/factories/exchange'

const search = vi.hoisted(() => ({ current: new URLSearchParams() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => search.current,
  usePathname: () => '/exchange',
  useParams: () => ({ id: 'exch-1' }),
}))

const screenState = vi.hoisted(() => ({ calls: [] as unknown[] }))
vi.mock('@/hooks/exchange/useExchangeScreen', () => ({
  useExchangeScreen: (filters: unknown) => {
    screenState.calls.push(filters)
    const list = {
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
    }
    return { market: list, myTrades: list }
  },
}))

const detail = vi.hoisted(() => ({
  offer: null as ExchangeDetail | null,
  isLoading: false,
  error: null as DetailLoadError | null,
  refresh: vi.fn(async () => {}),
}))
vi.mock('@/hooks/exchange/useExchangeDetail', () => ({
  useExchangeDetail: () => detail,
}))
vi.mock('@/components/exchange', () => ({
  ExchangeDetailApp: () => <p>offer body</p>,
}))
const registry = vi.hoisted(() => ({
  chains: null as { id: string; display_name: string }[] | null,
  status: 'loading' as string,
}))
vi.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: (
    select: (s: {
      chains: { id: string; display_name: string }[] | null
      status: string
      ensureLoaded: () => void
    }) => unknown,
  ) => select({ ...registry, ensureLoaded: () => undefined }),
  selectChainById: (
    chains: { id: string }[] | null,
    id: string,
  ) => chains?.find((c) => c.id === id) ?? null,
}))

beforeEach(() => {
  vi.clearAllMocks()
  search.current = new URLSearchParams()
  registry.chains = null
  registry.status = 'loading'
  screenState.calls = []
  detail.offer = null
  detail.isLoading = false
  detail.error = null
  useAuthStore.setState({ user: makeUser({ id: 'me', advanced_mode_enabled: true }) })
})

describe('/exchange', () => {
  it('shows the order book', () => {
    render(<ExchangePage />)
    expect(screen.getByRole('heading', { level: 1, name: EXCHANGE_COPY.title('market') })).toBeInTheDocument()
  })

  it('renders before the user record lands — a null user is not a lock', () => {
    useAuthStore.setState({ user: null })
    render(<ExchangePage />)
    expect(
      screen.getByRole('heading', { level: 1, name: EXCHANGE_COPY.title('market') }),
    ).toBeInTheDocument()
  })

  it('holds the request until the registry can VERIFY the chain in the link', () => {
    // `?chain=` arrives from a bookmark or a shared link, and the server 400s
    // an id it does not serve. Firing before the registry answers would turn a
    // stale link into "Offers could not be loaded" over a dead Try-again.
    search.current = new URLSearchParams('chain=solana:devnet')
    render(<ExchangePage />)
    expect(screenState.calls).toEqual([expect.objectContaining({ enabled: false })])
  })

  it('drops a chain the deployment does not serve, and loads the whole book', () => {
    search.current = new URLSearchParams('chain=eip155:99999')
    registry.chains = [{ id: 'solana:devnet', display_name: 'Solana Devnet' }]
    registry.status = 'ready'
    render(<ExchangePage />)
    expect(screenState.calls).toEqual([
      expect.objectContaining({ enabled: true, chainId: null }),
    ])
  })

  it('offers Post offer as a plain LINK to the sell surface — no nested button', () => {
    // Button's own contract: links that look like buttons use buttonVariants()
    // on the anchor. A real <button> inside <a> is invalid interactive nesting.
    render(<ExchangePage />)
    const post = screen.getByRole('link', { name: EXCHANGE_COPY.postOffer })
    expect(post).toHaveAttribute('href', sellHref('offer'))
    expect(post.querySelector('button')).toBeNull()
  })

  it('serves the book to a user with advanced mode OFF — the lock is gone (#50)', () => {
    // Mobile shows everyone the Trade tab and the wire opens browse/accept to
    // all authed users (server decision #14); only web locked the page.
    registry.chains = [{ id: 'solana:devnet', display_name: 'Solana Devnet' }]
    registry.status = 'ready'
    useAuthStore.setState({ user: makeUser({ id: 'me', advanced_mode_enabled: false }) })
    render(<ExchangePage />)
    expect(
      screen.getByRole('heading', { level: 1, name: EXCHANGE_COPY.title('market') }),
    ).toBeInTheDocument()
    expect(screenState.calls).toEqual([expect.objectContaining({ enabled: true })])
  })
})

describe('/exchange/[id]', () => {
  it('renders the offer when it loads', () => {
    detail.offer = makeExchangeDetail()
    render(<ExchangeDetailRoute id="exch-1" />)
    expect(screen.getByText('offer body')).toBeInTheDocument()
  })

  it('shows nothing but a spinner while it is still loading', () => {
    detail.isLoading = true
    render(<ExchangeDetailRoute id="exch-1" />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('offer body')).toBeNull()
  })

  it('sends a reader back to the book when the offer is GONE', () => {
    detail.error = { gone: true, message: 'not found' }
    render(<ExchangeDetailRoute id="exch-1" />)
    expect(screen.getByText(OFFER_DETAIL_COPY.unavailableTitle)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: OFFER_DETAIL_COPY.back })).toHaveAttribute(
      'href',
      '/exchange',
    )
    // No retry: re-reading a deleted offer produces the same 404.
    expect(screen.queryByRole('button', { name: OFFER_DETAIL_COPY.retry })).toBeNull()
  })

  it('offers a RETRY when the read merely failed', async () => {
    detail.error = { gone: false, message: 'network down' }
    render(<ExchangeDetailRoute id="exch-1" />)
    expect(screen.getByText(OFFER_DETAIL_COPY.loadFailedTitle)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: OFFER_DETAIL_COPY.retry }))
    expect(detail.refresh).toHaveBeenCalledTimes(1)
  })
})
