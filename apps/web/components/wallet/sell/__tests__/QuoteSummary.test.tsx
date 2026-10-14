/**
 * The quote panel.
 *
 * Two things it must get right: a RATE keeps its decimals while the amounts
 * beside it do not (the defect fixed on the order book in #18 and on mobile in
 * #29 — this is the third surface it applies to), and the expiry is a warning
 * rather than decoration, because the hook refuses to submit against a quote
 * that has run out.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { FiatQuoteResponse } from '@tenda/shared'
import { QuoteSummary } from '@/components/wallet/sell/QuoteSummary'
import { SELL_COPY } from '@/components/wallet/sell/copy'

const quote = (over: Partial<FiatQuoteResponse> = {}): FiatQuoteResponse =>
  ({
    intent_id: 'int-1',
    provider: 'rail-x',
    rate: 1500,
    fee_amount: 250,
    fiat_amount: 74_750,
    asset_amount_raw: '50000000',
    kyc_required: false,
    expires_at: new Date(Date.now() + 30_000).toISOString(),
    ...over,
  }) as FiatQuoteResponse

describe('QuoteSummary', () => {
  it('states the rate, the fee and what actually lands', () => {
    render(
      <QuoteSummary quote={quote()} expiresIn={30} currency="NGN" assetSymbol="USDC" onRefresh={vi.fn()} />,
    )
    expect(screen.getByText('₦1,500 / USDC')).toBeInTheDocument()
    expect(screen.getByText('₦250')).toBeInTheDocument()
    expect(screen.getByText('₦74,750')).toBeInTheDocument()
  })

  it('keeps a fractional RATE distinguishable while rounding the amounts', () => {
    // GHS trades near 15/USDC, so whole-unit rounding on the rate is a ~3%
    // band on the figure the reader is agreeing to.
    render(
      <QuoteSummary
        quote={quote({ rate: 15.49, fee_amount: 12.4, fiat_amount: 774.5 })}
        expiresIn={30}
        currency="GHS"
        assetSymbol="USDC"
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByText('GH₵15.49 / USDC')).toBeInTheDocument()
    // The fee and total are AMOUNTS — whole units are right for them.
    expect(screen.getByText('GH₵12')).toBeInTheDocument()
    expect(screen.getByText('GH₵775')).toBeInTheDocument()
  })

  it('counts down, and says plainly when the quote has run out', () => {
    const live = render(
      <QuoteSummary quote={quote()} expiresIn={22} currency="NGN" assetSymbol="USDC" onRefresh={vi.fn()} />,
    )
    expect(screen.getByText('22s')).toBeInTheDocument()
    expect(screen.queryByText(SELL_COPY.quote.expired)).toBeNull()
    live.unmount()

    render(
      <QuoteSummary quote={quote()} expiresIn={0} currency="NGN" assetSymbol="USDC" onRefresh={vi.fn()} />,
    )
    expect(screen.getByText(SELL_COPY.quote.expired)).toBeInTheDocument()
  })

  it('offers a refresh at every point, including before it expires', async () => {
    const onRefresh = vi.fn()
    render(
      <QuoteSummary quote={quote()} expiresIn={30} currency="NGN" assetSymbol="USDC" onRefresh={onRefresh} />,
    )
    screen.getByRole('button', { name: new RegExp(SELL_COPY.quote.refresh) }).click()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
