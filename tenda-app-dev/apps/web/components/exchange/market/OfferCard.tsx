'use client'

/**
 * One row of the order book (Tier-3 comp, lines 445-513): who is quoting, at
 * what rate, and how long you would have to pay.
 *
 * Three things the comp draws are NOT here, each because the wire cannot
 * support them (spec-corrections #34-#36):
 *   - a rank ("01") and a "Best" badge. `/v1/exchange` orders by listing time
 *     and paginates, so row one is the newest offer, not the best rate — and
 *     sorting the page client-side would only rank the page.
 *   - trades settled, completion rate, reply time, and a "verified" tick
 *     derived from a trade count. `UserRef` carries an average review score
 *     and a country. Everything else on that list would be invented.
 *   - the seller's payment rails. `payout_account` is party-scoped: the server
 *     nulls it for anyone who is not in the trade, so a public row advertising
 *     the rails would be publishing the one field it withholds.
 *
 * What IS drawn is every fact the row carries, laid out as the comp lays it
 * out: identity, then the rate, then the commitment.
 */
import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'
import {
  countryDisplayName,
  formatAssetAmount,
  formatDurationShort,
  formatFiat,
  formatFullName,
  formatRate,
  type ExchangeSummary,
} from '@tenda/shared'
import { ChainBadge } from '@/components/shared/ChainBadge'
import { Avatar } from '@/components/ui/Avatar'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { RatingStars } from '@/components/ui/RatingStars'
import { cn } from '@/lib/cn'
import { EXCHANGE_COPY, EXCHANGE_ROW_CLASS, rateUnitLabel } from './copy'

export const OFFER_CARD_COPY = {
  cta: 'Buy',
  forSale: (amount: string) => `${amount} for sale`,
  total: (fiat: string) => `${fiat} total`,
  seeker: 'Seeker',
  unrated: 'No reviews yet',
  anonymous: 'Trader',
} as const

export function OfferCard({ offer }: { offer: ExchangeSummary }) {
  const currency = offer.fiat_currency
  const fiat = formatFiat(Number(offer.fiat_amount), currency)
  // A RATE, not an amount: `formatFiat` would round 15.49 and 15.40 to the
  // same "GH₵15" in the column this card exists to be compared down.
  const rate = formatRate(Number(offer.rate), currency)
  const sellerName = formatFullName(offer.creator.first_name, offer.creator.last_name) || OFFER_CARD_COPY.anonymous
  const score = offer.creator.review_score === null ? null : Number(offer.creator.review_score)
  const country = countryDisplayName(offer.creator.country)

  return (
    <Link
      href={`/exchange/${offer.escrow_id}`}
      className={cn(EXCHANGE_ROW_CLASS, 'block')}
    >
      <div
        data-offer
        className="grid items-stretch gap-6 max-[760px]:grid-cols-1 min-[761px]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_auto]"
      >
        <div className="flex min-w-0 gap-3.5">
          <Avatar name={sellerName} src={offer.creator.avatar_url} size="md" />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="truncate font-display type-title text-content-primary">
              {sellerName}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {score === null ? (
                <span className="text-xs leading-4 text-content-tertiary">
                  {OFFER_CARD_COPY.unrated}
                </span>
              ) : (
                <>
                  <RatingStars score={score} size={13} />
                  <span className="font-numeric text-xs font-bold leading-4 text-content-secondary">
                    {score.toFixed(1)}
                  </span>
                </>
              )}
              {country !== null && (
                <span className="truncate text-xs leading-4 text-content-tertiary">{country}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <ChainBadge chainId={offer.chain_id} size="sm" />
              {offer.creator.is_seeker && (
                <span className="rounded-full border border-border-subtle bg-surface-inset px-2.5 py-0.5 text-[11px] font-semibold leading-4 text-content-secondary">
                  {OFFER_CARD_COPY.seeker}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center max-[760px]:border-t max-[760px]:border-border-subtle max-[760px]:pt-4 min-[761px]:border-l min-[761px]:border-border-subtle min-[761px]:pl-6">
          <Eyebrow strong>{rateUnitLabel(offer.fiat_currency, offer.asset)}</Eyebrow>
          <p className="mt-1.5 font-numeric text-[28px] font-semibold leading-8 tracking-[-0.6px] text-content-primary">
            {rate}
          </p>
          <div className="mt-3 flex flex-col gap-0.5">
            <span className="font-numeric type-body-small text-content-secondary">
              {OFFER_CARD_COPY.forSale(formatAssetAmount(offer.amount_raw, offer.asset))}
            </span>
            <span className="font-numeric text-xs leading-[18px] text-content-tertiary">
              {OFFER_CARD_COPY.total(fiat)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 min-[761px]:flex-col min-[761px]:items-end min-[761px]:justify-between">
          <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border-subtle bg-surface-inset px-2.5 py-1 font-numeric text-[11px] font-bold leading-4 text-content-secondary">
            <Clock size={13} aria-hidden className="shrink-0 text-content-tertiary" />
            {EXCHANGE_COPY.window(formatDurationShort(offer.payment_window_seconds))}
          </span>
          {/* A span, not a button: the whole card is the link, and a control
              inside it would be a second tab stop to the same place. */}
          <span className="flex items-center gap-2 whitespace-nowrap rounded-control bg-brand-solid px-4 py-2.5 text-sm font-bold text-brand-on-primary">
            {OFFER_CARD_COPY.cta}
            <ArrowRight size={14} aria-hidden className="shrink-0" />
          </span>
        </div>
      </div>
    </Link>
  )
}
