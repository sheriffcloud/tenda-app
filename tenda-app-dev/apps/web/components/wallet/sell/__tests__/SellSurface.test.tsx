/**
 * The sell surface: two modes, one payout aside.
 *
 * The aside is shared by both modes ON PURPOSE — the payout account decides
 * the currency for a market quote and for an offer alike, so asking twice
 * would let the two answers disagree.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BankAccountSummary } from '@tenda/shared'
import { SellSurface } from '@/components/wallet/sell/SellSurface'
import { SELL_COPY, sellHref } from '@/components/wallet/sell/copy'
import type { ExchangeAssetOption } from '@/hooks/exchange/useExchangeAssetOptions'

const state = vi.hoisted(() => ({
  options: [] as ExchangeAssetOption[],
  accounts: [] as BankAccountSummary[],
}))
vi.mock('@/hooks/exchange/useExchangeAssetOptions', () => ({
  // Returns the empty-reason too since #60; 'ready'/'no-wallet' is derived from
  // the fixture so a surface test never has to state it twice.
  useExchangeAssetOptions: () => ({
    options: state.options,
    section: state.options.length > 0 ? 'ready' : 'no-wallet',
  }),
}))
vi.mock('@/hooks/fiat/usePayoutAccounts', () => ({
  usePayoutAccounts: () => ({
    accounts: state.accounts,
    selectedId: state.accounts[0]?.id ?? null,
    setSelectedId: vi.fn(),
    selected: state.accounts[0] ?? null,
    reload: vi.fn(),
  }),
}))
vi.mock('@/hooks/fiat/useInstantSell', () => ({
  useInstantSell: () => ({
    quote: null,
    expiresIn: 0,
    loading: false,
    error: null,
    refetch: vi.fn(),
    currency: 'NGN',
    currencySymbol: '₦',
    submitting: false,
    confirm: vi.fn(),
  }),
}))
vi.mock('@/hooks/exchange/useOfferSell', () => ({
  useOfferSell: () => ({ submit: vi.fn(), submitting: false }),
}))
vi.mock('@/components/shared/FeeSummary', () => ({ FeeSummary: () => null }))

const option = {
  chainId: 'solana:devnet',
  assetId: 'USDC_SOL',
  symbol: 'USDC',
  decimals: 6,
  walletAddress: 'SoLAddr1',
} as ExchangeAssetOption

const account = { id: 'acc-1', country: 'NG', account_name: 'Ada' } as BankAccountSummary

describe('SellSurface', () => {
  it('asks for a wallet before anything else — selling signs from the reader’s own', () => {
    state.options = []
    state.accounts = []
    render(<SellSurface mode="instant" />)
    expect(screen.getByText(SELL_COPY.noWallet)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: SELL_COPY.noWalletAction })).toHaveAttribute(
      'href',
      '/settings/linked-wallets',
    )
    // And no amount field to fill in for a sale that cannot be signed.
    expect(screen.queryByLabelText(SELL_COPY.amountLabel)).toBeNull()
  })

  it('makes the two modes LINKS, each with its own address', () => {
    state.options = [option]
    state.accounts = [account]
    render(<SellSurface mode="instant" />)
    expect(screen.getByRole('link', { name: 'Instant' })).toHaveAttribute('href', sellHref('instant'))
    expect(screen.getByRole('link', { name: 'Create offer' })).toHaveAttribute(
      'href',
      sellHref('offer'),
    )
  })

  it('marks the open mode for assistive tech, not only with colour', () => {
    state.options = [option]
    state.accounts = [account]
    render(<SellSurface mode="offer" />)
    expect(screen.getByRole('link', { name: 'Create offer' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Instant' })).not.toHaveAttribute('aria-current')
  })

  it('keeps the payout aside on BOTH modes — one destination, asked once', () => {
    state.options = [option]
    state.accounts = [account]
    const instant = render(<SellSurface mode="instant" />)
    expect(screen.getByText(SELL_COPY.railLabel)).toBeInTheDocument()
    instant.unmount()

    render(<SellSurface mode="offer" />)
    expect(screen.getByText(SELL_COPY.railLabel)).toBeInTheDocument()
  })

  it('says what each mode does, in different words', () => {
    state.options = [option]
    state.accounts = [account]
    const instant = render(<SellSurface mode="instant" />)
    expect(screen.getByText(SELL_COPY.lede('instant'))).toBeInTheDocument()
    instant.unmount()

    render(<SellSurface mode="offer" />)
    expect(screen.getByText(SELL_COPY.lede('offer'))).toBeInTheDocument()
  })

  it('offers no Buy anywhere on the surface', () => {
    state.options = [option]
    state.accounts = [account]
    const { container } = render(<SellSurface mode="instant" />)
    expect(container.textContent).not.toMatch(/\bbuy\b/i)
  })
})
