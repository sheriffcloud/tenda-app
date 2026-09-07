/**
 * The instant cash-out panel, whose states are the quote's states.
 *
 * "No route right now" and "the request broke" are kept apart deliberately:
 * the rails ANSWERED in the first case, so a retry would only ask the same
 * question — the way forward is the other way to sell.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { P2P_PROVIDER_ID, type BankAccountSummary } from '@tenda/shared'
import { InstantSellPanel } from '@/components/wallet/sell/InstantSellPanel'
import { SELL_COPY, sellHref } from '@/components/wallet/sell/copy'
import type { ExchangeAssetOption } from '@/hooks/exchange/useExchangeAssetOptions'

const sell = vi.hoisted(() => ({
  current: {
    quote: null as { intent_id: string; provider: string; rate: number; fee_amount: number; fiat_amount: number } | null,
    expiresIn: 0,
    loading: false,
    error: null as 'unavailable' | 'failed' | null,
    refetch: vi.fn(),
    currency: 'NGN',
    currencySymbol: '₦',
    submitting: false,
    confirm: vi.fn(),
  },
}))
vi.mock('@/hooks/fiat/useInstantSell', () => ({ useInstantSell: () => sell.current }))
vi.mock('@/components/shared/FeeSummary', () => ({ FeeSummary: () => <p>fee-summary</p> }))

// Complete, uncast: a fixture is a claim about what the producer can send.
const option: ExchangeAssetOption = {
  chainId: 'solana:devnet',
  assetId: 'USDC_SOL',
  symbol: 'USDC',
  decimals: 6,
  chainName: 'Solana Devnet',
  walletAddress: 'SoLAddr1',
}

const selection = { options: [option], section: 'ready' as const, option, selectedKey: 'k', select: vi.fn() }
const account: BankAccountSummary = {
  id: 'acc-1',
  country: 'NG',
  kind: 'bank',
  bank_code: '058',
  account_number_masked: '••••6789',
  account_name: 'Ada Okafor',
  is_default: true,
  verified: true,
  created_at: '2026-08-01T00:00:00.000Z',
}
const payout = {
  accounts: [account],
  selectedId: 'acc-1',
  setSelectedId: vi.fn(),
  selected: account,
  reload: vi.fn(),
}

const view = () =>
  render(
    <InstantSellPanel selection={selection} payout={payout} amount="50" onAmountChange={vi.fn()} />,
  )

beforeEach(() => {
  sell.current = { ...sell.current, quote: null, expiresIn: 0, loading: false, error: null }
})

describe('InstantSellPanel', () => {
  it('survives losing every option mid-session — amount field stays, nothing quotes', () => {
    // A wallet unlinked while the surface is open empties the option set; the
    // panel must degrade to the bare field rather than crash or show a quote.
    render(
      <InstantSellPanel
        selection={{ options: [], section: 'no-wallet', option: null, selectedKey: '', select: vi.fn() }}
        payout={payout}
        amount="50"
        onAmountChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(SELL_COPY.amountLabel)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SELL_COPY.confirm })).toBeNull()
  })

  it('sends an unavailable rail to the OTHER way to sell, not to a dead retry', () => {
    sell.current = { ...sell.current, error: 'unavailable' }
    view()
    expect(screen.getByText(SELL_COPY.unavailableTitle)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: SELL_COPY.unavailableAction })).toHaveAttribute(
      'href',
      sellHref('offer'),
    )
    expect(screen.queryByRole('button', { name: SELL_COPY.retry })).toBeNull()
  })

  it('offers a RETRY when the request itself broke', () => {
    sell.current = { ...sell.current, error: 'failed' }
    view()
    expect(screen.getByText(SELL_COPY.failedTitle)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: SELL_COPY.retry })).toBeInTheDocument()
  })

  it('shows no confirm button until there is a quote to confirm', () => {
    sell.current = { ...sell.current, loading: true }
    view()
    expect(screen.getByText(SELL_COPY.quote.loading)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SELL_COPY.confirm })).toBeNull()
  })

  it('confirms the quote', () => {
    const confirm = vi.fn()
    sell.current = {
      ...sell.current,
      confirm,
      expiresIn: 30,
      quote: { intent_id: 'i', provider: 'rail-x', rate: 1500, fee_amount: 100, fiat_amount: 74_900 },
    }
    view()
    screen.getByRole('button', { name: SELL_COPY.confirm }).click()
    expect(confirm).toHaveBeenCalled()
  })

  it('discloses the platform fee when the route is a Tenda escrow, not only a rail', () => {
    // A P2P cash-out IS an escrow, so the quote is not the whole cost.
    sell.current = {
      ...sell.current,
      expiresIn: 30,
      // The CONSTANT, not the string 'p2p': the id is 'p2p_internal', and a
      // fixture that guesses it tests nothing the server can send.
      quote: { intent_id: 'i', provider: P2P_PROVIDER_ID, rate: 1500, fee_amount: 100, fiat_amount: 74_900 },
    }
    view()
    expect(screen.getByText('fee-summary')).toBeInTheDocument()
  })

  it('does not disclose an escrow fee for a plain rail quote', () => {
    sell.current = {
      ...sell.current,
      expiresIn: 30,
      quote: { intent_id: 'i', provider: 'rail-x', rate: 1500, fee_amount: 100, fiat_amount: 74_900 },
    }
    view()
    expect(screen.queryByText('fee-summary')).toBeNull()
  })
})
