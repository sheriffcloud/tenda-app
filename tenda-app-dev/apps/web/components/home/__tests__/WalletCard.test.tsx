/**
 * The wallet card over `useWalletScreen`: the headline, the lifetime totals,
 * one row per chain with the badge, the address and the primary mark — and
 * the link-a-wallet invitation in every state.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chainLabel, truncateWallet, type WalletChainBalance } from '@tenda/shared'
import { LINK_WALLET_HREF, WALLET_HREF, WalletCard } from '@/components/home/WalletCard'
import { HOME_COPY } from '@/components/home/copy'
import { useAuthStore } from '@/stores/auth.store'

const screenState = vi.hoisted(() => ({
  section: 'ready' as 'ready' | 'loading' | 'no-wallet' | 'balances-unavailable' | 'wallets-error',
  balances: [] as WalletChainBalance[],
  totalUsdc: 1284.5 as number | null,
  earnedUsdc: 2910 as number | null,
  spentUsdc: 1625.5 as number | null,
  isLoading: false,
  retryWallets: vi.fn(async () => {}),
}))
vi.mock('@/hooks/wallet/useWalletScreen', () => ({ useWalletScreen: () => screenState }))

const SOL = 'SoLPrimaryAddr1111111111111111111111111111'
const EVM = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'

function balance(over: Partial<WalletChainBalance>): WalletChainBalance {
  return {
    chainId: 'solana:devnet', namespace: 'solana', displayName: chainLabel('solana:devnet'), address: SOL,
    usdc: { assetId: 'USDC_SOL', symbol: 'USDC', amountRaw: '612200000', decimals: 6, isStable: true },
    native: { assetId: 'SOL', symbol: 'SOL', amountRaw: '840000000', decimals: 9, isStable: false },
    ...over,
  }
}

beforeEach(() => {
  screenState.section = 'ready'
  screenState.isLoading = false
  screenState.retryWallets.mockClear()
  screenState.totalUsdc = 1284.5
  screenState.balances = [
    balance({}),
    balance({ chainId: 'eip155:84532', namespace: 'eip155', displayName: chainLabel('eip155:84532'), address: EVM, usdc: { assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: '0', decimals: 6, isStable: true }, native: null }),
  ]
  useAuthStore.setState({
    wallets: [
      { chain_ns: 'solana', address: SOL, is_primary: true, verified_at: null },
      { chain_ns: 'eip155', address: EVM, is_primary: false, verified_at: null },
    ],
  })
})

describe('WalletCard', () => {
  it('shows the USDC headline across the chains, the lifetime totals and the linked count', () => {
    render(<WalletCard />)
    expect(screen.getByText('1,284.50')).toBeInTheDocument()
    expect(screen.getByText(HOME_COPY.wallet.across(2))).toBeInTheDocument()
    expect(screen.getByText('+2,910.00')).toBeInTheDocument()
    expect(screen.getByText('−1,625.50')).toBeInTheDocument()
    expect(screen.getByText(HOME_COPY.wallet.linked(2))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: new RegExp(HOME_COPY.wallet.open) })).toHaveAttribute('href', WALLET_HREF)
  })

  it('draws one row per chain: badge, short address with the primary mark, both balances', () => {
    render(<WalletCard />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent(chainLabel('solana:devnet'))
    expect(rows[0]).toHaveTextContent(`${truncateWallet(SOL)} · ${HOME_COPY.wallet.primary}`)
    expect(rows[0]).toHaveTextContent('612.20 USDC')
    expect(rows[0]).toHaveTextContent('0.84 SOL')
    expect(rows[0].querySelector('[data-chain-badge="solana:devnet"]')).not.toBeNull()
    expect(rows[1]).toHaveTextContent(truncateWallet(EVM))
    expect(rows[1]).not.toHaveTextContent(HOME_COPY.wallet.primary)
    expect(rows[1]).toHaveTextContent('0.00 USDC')
    // The full address never appears — it would not fit and is not the point.
    expect(document.body.textContent).not.toContain(SOL)
  })

  it('counts CHAINS, not balance rows — two wallets on one chain read "across 1 chain"', () => {
    screenState.balances = [balance({}), balance({ address: 'SoLSecondAddr222222222222222222222222222222' })]
    render(<WalletCard />)
    expect(screen.getByText(HOME_COPY.wallet.across(1))).toBeInTheDocument()
    expect(screen.queryByText(HOME_COPY.wallet.across(2))).toBeNull()
  })

  it('claims no chain count before any balance row has resolved', () => {
    // Between the wallets settling and the registry answering, the hook holds
    // no rows and is not loading — "across 0 chains" would be a lie.
    screenState.balances = []
    render(<WalletCard />)
    expect(screen.queryByText(/across/)).toBeNull()
    expect(screen.getByText(HOME_COPY.wallet.linked(2))).toBeInTheDocument()
  })

  it('invites a reader with no wallet to link one, and shows no confident zero', () => {
    screenState.section = 'no-wallet'
    screenState.balances = []
    useAuthStore.setState({ wallets: [] })
    render(<WalletCard />)
    expect(screen.getByText(HOME_COPY.wallet.linkFirst)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: HOME_COPY.wallet.link })).toHaveAttribute('href', LINK_WALLET_HREF)
    expect(screen.queryByText('1,284.50')).toBeNull()
    expect(screen.getByText(HOME_COPY.wallet.linked(0))).toBeInTheDocument()
  })

  it('claims no count and offers no invitation while the wallet LIST is still loading', () => {
    // On every dashboard mount the list is re-read, and on a cold sign-in it
    // is empty until /v1/users/me answers — so the card said "0 wallets
    // linked · link one" to a reader with two, for as long as that took.
    // The shared resolver's rule: idle/loading is never "no wallet linked".
    screenState.section = 'loading'
    screenState.isLoading = true
    screenState.balances = []
    useAuthStore.setState({ wallets: [] })
    render(<WalletCard />)
    expect(screen.getByTestId('wallet-card-skeleton')).toBeInTheDocument()
    expect(screen.queryByText(HOME_COPY.wallet.linked(0))).toBeNull()
    expect(screen.queryByText(HOME_COPY.wallet.linkFirst)).toBeNull()
    expect(screen.queryByRole('link', { name: HOME_COPY.wallet.link })).toBeNull()
  })

  it('says the wallet list could not be read, with a working retry, instead of inviting a link', async () => {
    screenState.section = 'wallets-error'
    screenState.balances = []
    useAuthStore.setState({ wallets: [] })
    render(<WalletCard />)
    expect(screen.getByText(HOME_COPY.wallet.walletsError)).toBeInTheDocument()
    expect(screen.queryByText(HOME_COPY.wallet.linked(0))).toBeNull()
    expect(screen.queryByText(HOME_COPY.wallet.linkFirst)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: HOME_COPY.wallet.retry }))
    expect(screenState.retryWallets).toHaveBeenCalledOnce()
  })

  it('keeps the LAST-GOOD list through a refresh — a known wallet is not unknown again', () => {
    // Section 'loading' with wallets held: the registry or the balances are
    // settling, not the list. The count is real and stays.
    screenState.section = 'loading'
    screenState.isLoading = true
    screenState.balances = []
    render(<WalletCard />)
    expect(screen.getByText(HOME_COPY.wallet.linked(2))).toBeInTheDocument()
    expect(screen.getByText(HOME_COPY.wallet.linkHint)).toBeInTheDocument()
  })

  it('shows a skeleton while balances load, and says so when they are unavailable', () => {
    screenState.isLoading = true
    const { unmount } = render(<WalletCard />)
    expect(screen.getByTestId('wallet-card-skeleton')).toBeInTheDocument()
    expect(screen.queryByText('1,284.50')).toBeNull()
    unmount()
    screenState.isLoading = false
    screenState.section = 'balances-unavailable'
    screenState.balances = []
    render(<WalletCard />)
    expect(screen.getByText(HOME_COPY.wallet.unavailable)).toBeInTheDocument()
    expect(screen.getByText(HOME_COPY.wallet.linkHint)).toBeInTheDocument()
  })
})
