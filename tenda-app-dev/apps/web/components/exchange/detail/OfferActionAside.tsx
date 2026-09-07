'use client'

/**
 * The offer page's sticky aside (Tier-3 comp, lines 609-642): what the trade
 * costs, the one control that commits to it, and the order of what happens
 * next.
 *
 * THE AMOUNT INPUT IS GONE, and that is the biggest divergence on this page
 * (spec-correction #33). The comp lets the reader type a quantity, validates it
 * against a minimum and the offer's remaining balance, and quotes them. Our
 * escrow holds ONE amount: `accept` takes the whole of it, there is no
 * `min_raw` on the wire, and no partial-accept transition exists on either
 * chain. A field that let someone type "20" and then locked 50 would be worse
 * than no field — so the panel states the two figures the escrow actually
 * carries and hands off to the transition set.
 *
 * The figures are perspective-aware. A seller reading their own offer is not
 * paying fiat for crypto, and telling them "you pay ₦75,000" would be exactly
 * backwards.
 */
import type { ReactNode } from 'react'
import {
  formatAssetAmount,
  formatFiat,
  type ExchangeDetail,
} from '@tenda/shared'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { useEscrowFee } from '@/hooks/escrow/useEscrowFee'
import { OFFER_DETAIL_COPY, type OfferPerspective } from './copy'

export const OFFER_ASIDE_COPY = {
  sellerPay: 'You locked',
  sellerReceive: 'You receive',
  sellerReceiveNote: 'Paid to you off-platform, into the payout account on this offer.',
  sellerPayNote: 'Held in escrow until the buyer pays and you confirm.',
} as const

export function OfferActionAside({
  offer,
  perspective,
  children,
}: {
  offer: ExchangeDetail
  /** 'seller' when the reader created this offer; 'buyer' for everyone else. */
  perspective: OfferPerspective
  /** The transition set for this reader and this status. */
  children: ReactNode
}) {
  const { netRaw } = useEscrowFee(offer.is_seeker, offer.amount_raw)
  const fiat = formatFiat(Number(offer.fiat_amount), offer.fiat_currency)
  const gross = formatAssetAmount(offer.amount_raw, offer.asset)
  const net = netRaw === null ? null : formatAssetAmount(netRaw.toString(), offer.asset)

  const isSeller = perspective === 'seller'

  return (
    // Sticky only where it is a COLUMN. Below the two-column breakpoint it is
    // stacked under the terms, and pinning it there would park the panel over
    // the content the reader is scrolling to check.
    <aside className="flex flex-col gap-4 min-[1064px]:sticky min-[1064px]:top-4">
      <div className="rounded-card border border-border-default bg-surface-card p-5.5 shadow-card">
        <Figure
          label={isSeller ? OFFER_ASIDE_COPY.sellerPay : OFFER_DETAIL_COPY.youPay}
          value={isSeller ? gross : fiat}
          note={isSeller ? OFFER_ASIDE_COPY.sellerPayNote : undefined}
        />
        <div className="mt-3.5 border-t border-border-subtle pt-3.5">
          <Figure
            label={isSeller ? OFFER_ASIDE_COPY.sellerReceive : OFFER_DETAIL_COPY.youReceive}
            // A buyer's figure is NET of the platform fee: the gross is what
            // the seller locked, not what lands in the buyer's wallet.
            value={isSeller ? fiat : (net ?? gross)}
            note={
              isSeller ? OFFER_ASIDE_COPY.sellerReceiveNote : net === null ? undefined : OFFER_DETAIL_COPY.receiveNote
            }
            money
          />
        </div>

        <div className="mt-4.5">{children}</div>
        <p className="mt-2.5 text-center text-xs leading-4 text-content-tertiary">
          {OFFER_DETAIL_COPY.ctaNote}
        </p>
      </div>

      <div className="rounded-card border border-border-subtle bg-surface-inset p-4.5">
        <Eyebrow as="h2">{OFFER_DETAIL_COPY.events}</Eyebrow>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 type-body-small text-content-secondary">
          {OFFER_DETAIL_COPY.steps[perspective].map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </aside>
  )
}

function Figure({
  label,
  value,
  note,
  money = false,
}: {
  label: string
  value: string
  note?: string
  money?: boolean
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="type-body-small text-content-secondary">{label}</span>
        <span
          className={
            money
              ? 'text-right font-numeric text-xl font-bold leading-[26px] text-utility-money'
              : 'text-right font-numeric text-xl font-bold leading-[26px] text-content-primary'
          }
        >
          {value}
        </span>
      </div>
      {note !== undefined && (
        <p className="mt-1.5 text-xs leading-4 text-content-tertiary">{note}</p>
      )}
    </div>
  )
}
