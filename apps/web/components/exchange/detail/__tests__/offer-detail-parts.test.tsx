/**
 * The offer page's headline, its terms grid and its sticky aside. (The trader
 * card is its own file beside this one.)
 *
 * The recurring assertion is what is NOT claimed: no minimum, no partial fill,
 * no re-quote, and no party-scoped field on a page an outsider can open.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OFFER_ASIDE_COPY,
  OFFER_DETAIL_COPY,
  OFFER_TERMS_COPY,
  OfferActionAside,
  OfferHeadline,
  OfferTerms,
} from '@/components/exchange/detail'
import { makeExchangeDetail } from '../../../../test/factories/exchange'

const LOADED_FEE = {
  feeBps: 250,
  feePct: '2.50',
  feeRaw: BigInt(1_250_000),
  netRaw: BigInt(48_750_000),
}
/** Platform config is a fetch; before it lands every figure is null. */
const PENDING_FEE = { feeBps: null, feePct: null, feeRaw: null, netRaw: null }
const fee = vi.hoisted(() => ({
  current: {
    feeBps: 250 as number | null,
    feePct: '2.50' as string | null,
    feeRaw: BigInt(1_250_000) as bigint | null,
    netRaw: BigInt(48_750_000) as bigint | null,
  },
}))
vi.mock('@/hooks/escrow/useEscrowFee', () => ({ useEscrowFee: () => fee.current }))

beforeEach(() => {
  fee.current = LOADED_FEE
})
// Standing is its own fetch and renders nothing until it lands; the card's
// contract here is what IT draws.
vi.mock('@/hooks/profile/useStanding', () => ({ useUserStanding: () => null }))

describe('OfferHeadline', () => {
  it('leads with the rate and names its unit from the offer', () => {
    render(<OfferHeadline offer={makeExchangeDetail()} />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(within(heading).getByText('₦1,500')).toBeInTheDocument()
    expect(within(heading).getByText('NGN per USDC')).toBeInTheDocument()
  })

  it('says which side the offer is, and carries the escrow reference', () => {
    render(<OfferHeadline offer={makeExchangeDetail()} />)
    expect(screen.getByText(OFFER_DETAIL_COPY.sideLabel('USDC_SOL'))).toBeInTheDocument()
    expect(screen.getByText('exch-1')).toBeInTheDocument()
  })

  it('does not promise a re-quote the escrow never performs', () => {
    render(<OfferHeadline offer={makeExchangeDetail()} />)
    // The comp says the rate is fixed "the moment you confirm". It was fixed
    // when the seller posted, and saying otherwise invites an expectation.
    expect(screen.getByText(OFFER_DETAIL_COPY.rateNote)).toBeInTheDocument()
    expect(screen.queryByText(/the moment you confirm/i)).toBeNull()
  })
})


describe('OfferTerms', () => {
  it('shows the viewer-relative escrow wallet only when the wire carries one', () => {
    render(
      <OfferTerms
        offer={makeExchangeDetail({ my_signer_address: 'MakerWa11et111111111111111111111111111111' })}
      />,
    )
    expect(screen.getByText(OFFER_TERMS_COPY.yourWallet)).toBeInTheDocument()
    expect(screen.getByText('Make…1111')).toBeInTheDocument()
    cleanup()
    // Outsiders (and unstamped escrows) get null on the wire → no row at all.
    render(<OfferTerms offer={makeExchangeDetail({ my_signer_address: null })} />)
    expect(screen.queryByText(OFFER_TERMS_COPY.yourWallet)).toBeNull()
  })

  it('lists the escrow’s own figures, fee included', () => {
    render(<OfferTerms offer={makeExchangeDetail()} />)
    expect(screen.getByText(OFFER_TERMS_COPY.locked)).toBeInTheDocument()
    expect(screen.getByText('50 USDC')).toBeInTheDocument()
    expect(screen.getByText('₦75,000')).toBeInTheDocument()
    expect(screen.getByText(OFFER_TERMS_COPY.fee('2.50'))).toBeInTheDocument()
    expect(screen.getByText('− 1.25 USDC')).toBeInTheDocument()
  })

  it('states no minimum and no "available", because the offer cannot be split', () => {
    const { container } = render(<OfferTerms offer={makeExchangeDetail()} />)
    const text = container.textContent ?? ''
    expect(text).not.toContain('Minimum')
    expect(text).not.toContain('available')
  })

  it('shows a placeholder — never a zero fee — before the platform config lands', () => {
    // `useEscrowFee` answers nulls until the config fetch resolves. "− 0 USDC"
    // there would be a claim about the fee, and the wrong one.
    fee.current = PENDING_FEE
    render(<OfferTerms offer={makeExchangeDetail()} />)
    expect(screen.getByText(OFFER_TERMS_COPY.fee(null))).toBeInTheDocument()
    expect(screen.getByText(OFFER_TERMS_COPY.unknown)).toBeInTheDocument()
  })

  it('always states when the offer was listed', () => {
    // Unconditional since #38: escrows.created_at is NOT NULL, so unlike the
    // closing date below there is no "absent" case for this row to have.
    render(<OfferTerms offer={makeExchangeDetail()} />)
    expect(screen.getByText(OFFER_TERMS_COPY.listed)).toBeInTheDocument()
  })

  it('omits a closing date the offer does not have', () => {
    const { rerender } = render(<OfferTerms offer={makeExchangeDetail({ accept_deadline: null })} />)
    expect(screen.queryByText(OFFER_TERMS_COPY.closes)).toBeNull()

    rerender(
      <OfferTerms offer={makeExchangeDetail({ accept_deadline: '2026-08-20T10:00:00.000Z' })} />,
    )
    expect(screen.getByText(OFFER_TERMS_COPY.closes)).toBeInTheDocument()
  })
})

describe('OfferActionAside', () => {
  it('tells a BUYER what they pay and what actually reaches them', () => {
    render(
      <OfferActionAside offer={makeExchangeDetail()} perspective="buyer">
        <button type="button">Accept offer</button>
      </OfferActionAside>,
    )
    expect(screen.getByText(OFFER_DETAIL_COPY.youPay)).toBeInTheDocument()
    expect(screen.getByText('₦75,000')).toBeInTheDocument()
    // NET, not the 50 gross: the fee comes out of what the buyer receives.
    expect(screen.getByText('48.75 USDC')).toBeInTheDocument()
    expect(screen.queryByText('50 USDC')).toBeNull()
    expect(screen.getByText(OFFER_DETAIL_COPY.receiveNote)).toBeInTheDocument()
  })

  it('does not tell a SELLER they are paying fiat for their own crypto', () => {
    render(
      <OfferActionAside offer={makeExchangeDetail()} perspective="seller">
        <button type="button">Cancel offer</button>
      </OfferActionAside>,
    )
    expect(screen.getByText(OFFER_ASIDE_COPY.sellerPay)).toBeInTheDocument()
    expect(screen.getByText('50 USDC')).toBeInTheDocument()
    expect(screen.getByText(OFFER_ASIDE_COPY.sellerReceive)).toBeInTheDocument()
    expect(screen.getByText('₦75,000')).toBeInTheDocument()
    expect(screen.queryByText(OFFER_DETAIL_COPY.youPay)).toBeNull()
  })

  it('has NO amount field — the escrow cannot be partially taken', () => {
    render(
      <OfferActionAside offer={makeExchangeDetail()} perspective="buyer">
        <button type="button">Accept offer</button>
      </OfferActionAside>,
    )
    // The comp's input would let a reader type 20 and then lock 50.
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('falls back to the GROSS rather than a blank while the fee is unknown', () => {
    fee.current = PENDING_FEE
    render(
      <OfferActionAside offer={makeExchangeDetail()} perspective="buyer">
        <span />
      </OfferActionAside>,
    )
    expect(screen.getByText('50 USDC')).toBeInTheDocument()
    // And no note claiming a fee has been taken off it.
    expect(screen.queryByText(OFFER_DETAIL_COPY.receiveNote)).toBeNull()
  })

  it('hosts the real transition set rather than a CTA of its own', () => {
    render(
      <OfferActionAside offer={makeExchangeDetail()} perspective="buyer">
        <button type="button">Accept offer</button>
      </OfferActionAside>,
    )
    expect(screen.getByRole('button', { name: 'Accept offer' })).toBeInTheDocument()
    expect(screen.getByText(OFFER_DETAIL_COPY.ctaNote)).toBeInTheDocument()
  })

  it('walks through what happens next, in order', () => {
    render(
      <OfferActionAside offer={makeExchangeDetail()} perspective="buyer">
        <span />
      </OfferActionAside>,
    )
    const steps = screen.getByRole('list')
    expect(within(steps).getAllByRole('listitem')).toHaveLength(
      OFFER_DETAIL_COPY.steps.buyer.length,
    )
    expect(steps.tagName).toBe('OL')
  })
})

describe('OfferActionAside — order of events', () => {
  it('walks a BUYER through the steps they will take', () => {
    render(
      <OfferActionAside offer={makeExchangeDetail()} perspective="buyer">
        <span />
      </OfferActionAside>,
    )
    const steps = screen.getByRole('list')
    expect(within(steps).getByText(/You accept/)).toBeInTheDocument()
    expect(within(steps).getByText(/you pay the seller/)).toBeInTheDocument()
  })

  it('never tells a SELLER they will pay fiat for their own crypto', () => {
    // The figures above this list are already perspective-aware; a list that
    // is not inverts all four lines for the one reader who cannot take the
    // offer — they posted it. Cancel Offer sits directly above it.
    render(
      <OfferActionAside offer={makeExchangeDetail()} perspective="seller">
        <span />
      </OfferActionAside>,
    )
    const steps = screen.getByRole('list')
    expect(within(steps).queryByText(/You accept/)).toBeNull()
    expect(within(steps).queryByText(/you pay the seller/)).toBeNull()
    expect(within(steps).queryByText(/You mark the payment sent/)).toBeNull()
    expect(within(steps).getByText(/You confirm the money arrived/)).toBeInTheDocument()
  })
})

describe('OfferHeadline — rate precision', () => {
  it('does not round the deciding figure to whole units', () => {
    // This is the 44px number a reader decides on. Rounding it to "GH₵15"
    // hides the difference between the offer they picked and the next one.
    render(
      <OfferHeadline
        offer={makeExchangeDetail({ rate: '15.4900000000', fiat_currency: 'GHS' })}
      />,
    )
    expect(
      within(screen.getByRole('heading', { level: 1 })).getByText('GH₵15.49'),
    ).toBeInTheDocument()
  })
})

describe('OfferTerms — an asset the display metadata does not know', () => {
  it('renders the raw asset id rather than "undefined"', () => {
    // `asset` is a plain string on the wire (types/exchange.ts), so a chain
    // enabled server-side before the client ships its ASSET_META entry lands
    // here. `rateUnitLabel` has the same fallback and is tested; this one was
    // the untested twin.
    render(<OfferTerms offer={makeExchangeDetail({ asset: 'USDC_NEWCHAIN' })} />)
    expect(screen.getByText(/\/ USDC_NEWCHAIN$/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('undefined')
  })
})
