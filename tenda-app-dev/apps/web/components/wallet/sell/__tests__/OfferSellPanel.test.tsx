/**
 * Create offer.
 *
 * Validation is the SHARED `getOfferMissingRequirement`, and the point of it is
 * that the button says what is missing rather than sitting disabled and silent.
 * These assert the button's label IS that requirement, so a local re-encoding
 * of the rule would show up immediately.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { getOfferMissingRequirement, type BankAccountSummary } from '@tenda/shared'
import { OfferSellPanel, OFFER_SELL_COPY } from '@/components/wallet/sell/OfferSellPanel'
import { OFFER_DEADLINE_COPY } from '@/components/wallet/sell/OfferDeadlines'
import type { ExchangeAssetOption } from '@/hooks/exchange/useExchangeAssetOptions'

const submit = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/exchange/useOfferSell', () => ({
  useOfferSell: () => ({ submit, submitting: false }),
}))
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
const selection = { options: [option], section: 'ready' as const, option, selectedKey: 'k', select: vi.fn() }
const payout = {
  accounts: [account],
  selectedId: 'acc-1',
  setSelectedId: vi.fn(),
  selected: account,
  reload: vi.fn(),
}

type PayoutState = Parameters<typeof OfferSellPanel>[0]['payout']

const view = (amount = '', over: Partial<PayoutState> = {}) =>
  render(
    <OfferSellPanel
      selection={selection}
      payout={{ ...payout, ...over }}
      amount={amount}
      onAmountChange={vi.fn()}
    />,
  )

describe('OfferSellPanel', () => {
  it('with every option gone mid-session the CTA names the missing asset, disabled', () => {
    const expected = getOfferMissingRequirement({
      hasAsset: false,
      amountRaw: null,
      rate: 0,
      fiatTotal: 0,
      hasPayoutAccount: true,
    })
    expect(expected).not.toBeNull()
    render(
      <OfferSellPanel
        selection={{ options: [], section: 'no-wallet', option: null, selectedKey: '', select: vi.fn() }}
        payout={payout}
        amount="50"
        onAmountChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: expected as string })).toBeDisabled()
  })

  it('labels the button with the SHARED requirement, not a local guess', () => {
    view('')
    const expected = getOfferMissingRequirement({
      hasAsset: true,
      amountRaw: null,
      rate: Number(''),
      fiatTotal: 0,
      hasPayoutAccount: true,
    })
    expect(expected).not.toBeNull()
    expect(screen.getByRole('button', { name: expected as string })).toBeDisabled()
  })

  it('asks for a rate once an amount is in', () => {
    view('50')
    expect(screen.getByRole('button', { name: 'Set your rate' })).toBeDisabled()
  })

  it('offers both windows, from the shared option sets', () => {
    view('50')
    expect(screen.getByText(OFFER_DEADLINE_COPY.accept)).toBeInTheDocument()
    expect(screen.getByText(OFFER_DEADLINE_COPY.window)).toBeInTheDocument()
    // 7d is the default accept window and must be a chip that exists.
    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says what the buyer pays once a rate is set, and discloses the escrow fee', async () => {
    const { container } = view('50')
    const rate = screen.getByLabelText(OFFER_SELL_COPY.rateLabel)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(rate, { target: { value: '1500' } })
    expect(screen.getByText('₦75,000')).toBeInTheDocument()
    expect(container.textContent).toContain('fee-summary')
    expect(screen.getByRole('button', { name: OFFER_SELL_COPY.submit })).toBeEnabled()
  })

  it('does not post without a payout account — there is nowhere for the money to go', () => {
    view('50', { selected: null, accounts: [], selectedId: null })
    expect(screen.queryByRole('button', { name: OFFER_SELL_COPY.submit })).toBeNull()
  })
})

describe('posting the offer', () => {
  it('submits exactly what the reader set — amount, rate, total and both windows', async () => {
    const { fireEvent } = await import('@testing-library/react')
    submit.mockClear()
    view('50')
    fireEvent.change(screen.getByLabelText(OFFER_SELL_COPY.rateLabel), {
      target: { value: '1500' },
    })
    // Change a window so the assertion cannot pass on defaults alone.
    fireEvent.click(screen.getByRole('button', { name: '24h' }))
    fireEvent.click(screen.getByRole('button', { name: OFFER_SELL_COPY.submit }))

    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        amountRaw: '50000000', // 50 USDC at 6 decimals
        rate: 1500,
        fiatTotal: 75_000,
        currency: 'NGN',
        acceptHours: 24,
        account: expect.objectContaining({ id: 'acc-1' }),
      }),
    )
  })

  it('floors the fiat total to whole minor units — a buyer cannot transfer a third of a kobo', async () => {
    const { fireEvent } = await import('@testing-library/react')
    submit.mockClear()
    view('3')
    fireEvent.change(screen.getByLabelText(OFFER_SELL_COPY.rateLabel), {
      target: { value: '1000.333' },
    })
    fireEvent.click(screen.getByRole('button', { name: OFFER_SELL_COPY.submit }))
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ fiatTotal: 3000.99 }))
  })

  it('cannot be submitted while a requirement is unmet — the button is disabled', async () => {
    // Measured: the guard inside `handleSubmit` is NOT what stops this — the
    // disabled attribute is, and a click never reaches the handler. Naming the
    // test after the guard would have claimed a proof it does not give.
    const { fireEvent } = await import('@testing-library/react')
    submit.mockClear()
    view('50') // no rate set
    const cta = screen.getByRole('button', { name: 'Set your rate' })
    expect(cta).toBeDisabled()
    fireEvent.click(cta)
    expect(submit).not.toHaveBeenCalled()
  })
})
