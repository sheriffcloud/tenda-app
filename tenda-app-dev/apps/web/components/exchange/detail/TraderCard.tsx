'use client'

/**
 * "The person on the other side" (Tier-3 comp, lines 547-594).
 *
 * The comp's stat grid reads: average rating, trades settled, completion rate,
 * replies within 4 min — and a "verified" tick for anyone past 150 trades. One
 * of those five exists. `UserRef` carries `review_score`, `country` and
 * `is_seeker`; the offer carries its reviews. Trade counts, completion rates
 * and reply times are not on any wire this page reads, and inventing them here
 * would be inventing a reputation (spec-correction #34).
 *
 * So the grid holds what is true, and the card keeps the affordances the comp
 * has no equivalent for: opening the trader's profile, and messaging them in
 * the context of this escrow. A trade you cannot ask a question about is worse
 * than one drawn with fewer statistics.
 */
import type { ReactNode } from 'react'
import Link from 'next/link'
import { MessageCircle, Star, ShieldCheck, Smartphone } from 'lucide-react'
import { countryDisplayName, formatFullName, type ExchangeDetail, type UserRef } from '@tenda/shared'
import { Avatar } from '@/components/ui/Avatar'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { RatingStars } from '@/components/ui/RatingStars'
import { StandingBadge } from '@/components/profile'
import { escrowChatHref } from '@/lib/chat-href'
import { OFFER_DETAIL_COPY, exchangeChatContext } from './copy'

export const TRADER_CARD_COPY = {
  anonymous: 'Trader',
  you: 'You',
  /**
   * The card renders the escrow's CREATOR, so for a seller reading their own
   * offer it is their own card — and "the person on the other side" above it
   * named them as somebody else.
   */
  selfHeading: 'Your offer, as a buyer sees it',
  rating: 'average rating',
  reviews: (total: number) => (total === 1 ? 'review' : 'reviews'),
  unrated: 'No rating yet',
  unratedNote: 'This trader has not been reviewed. Escrow protects you either way.',
  seeker: 'Seeker phone',
  seekerNote: 'Signed up on a Solana Seeker device',
  message: (name: string) => `Message ${name}`,
  profile: (name: string) => `View ${name}'s profile`,
} as const

export function TraderCard({
  trader,
  offer,
  currentUserId,
}: {
  trader: UserRef
  offer: Pick<ExchangeDetail, 'escrow_id' | 'reviews' | 'fiat_amount' | 'fiat_currency'>
  currentUserId: string
}) {
  const name = formatFullName(trader.first_name, trader.last_name) || TRADER_CARD_COPY.anonymous
  const isSelf = trader.id === currentUserId
  const score = trader.review_score === null ? null : Number(trader.review_score)
  const country = countryDisplayName(trader.country)
  const reviewCount = offer.reviews.length

  const chatHref = escrowChatHref(trader.id, exchangeChatContext(offer))

  return (
    <section className="mt-8 border-t border-border-subtle pt-6">
      <Eyebrow as="h2" className="mb-4.5">
        {isSelf ? TRADER_CARD_COPY.selfHeading : OFFER_DETAIL_COPY.trader}
      </Eyebrow>

      <div className="rounded-card border border-border-subtle bg-surface-card p-5.5 shadow-card">
        <div className="flex items-center gap-4">
          <Link href={`/profile/${trader.id}`} aria-label={TRADER_CARD_COPY.profile(name)}>
            <Avatar name={name} src={trader.avatar_url} size="lg" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/profile/${trader.id}`}
              className="block truncate type-h2 text-content-primary hover:underline"
            >
              {isSelf ? TRADER_CARD_COPY.you : name}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {score !== null && (
                <>
                  <RatingStars score={score} size={15} />
                  <span className="font-numeric type-body-small font-bold text-content-secondary">
                    {score.toFixed(1)}
                  </span>
                </>
              )}
              {country !== null && (
                <span className="type-body-small text-content-tertiary">{country}</span>
              )}
            </div>
            <div className="mt-1.5">
              <StandingBadge userId={trader.id} />
            </div>
          </div>
          {!isSelf && (
            <Link
              href={chatHref}
              aria-label={TRADER_CARD_COPY.message(name)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-brand-primary transition-colors duration-(--motion-fast) hover:bg-surface-inset"
            >
              <MessageCircle size={19} aria-hidden />
            </Link>
          )}
        </div>

        <div className="mt-5.5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4.5 border-t border-border-subtle pt-5">
          <Stat
            icon={<Star size={14} />}
            value={score === null ? '—' : score.toFixed(2)}
            label={score === null ? TRADER_CARD_COPY.unrated : TRADER_CARD_COPY.rating}
            note={score === null ? TRADER_CARD_COPY.unratedNote : undefined}
          />
          <Stat
            icon={<ShieldCheck size={14} />}
            value={String(reviewCount)}
            label={`${TRADER_CARD_COPY.reviews(reviewCount)} on this trade`}
          />
          {trader.is_seeker && (
            <Stat
              icon={<Smartphone size={14} />}
              value={TRADER_CARD_COPY.seeker}
              label={TRADER_CARD_COPY.seekerNote}
            />
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Deliberately NOT a `<dl>`: the comps put the figure above its label, and a
 * description list requires the `<dt>` first in source order — so honouring
 * both would mean reversing the DOM with CSS and handing a screen reader the
 * label after the number it describes.
 */
function Stat({
  icon,
  value,
  label,
  note,
}: {
  icon: ReactNode
  value: string
  label: string
  note?: string
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5">
        <span aria-hidden className="shrink-0 text-content-tertiary">
          {icon}
        </span>
        <span className="font-numeric text-xl font-bold leading-[26px] text-content-primary">
          {value}
        </span>
      </p>
      <p className="mt-1 text-xs leading-4 text-content-tertiary">{label}</p>
      {note !== undefined && (
        <p className="mt-1 text-xs leading-4 text-content-tertiary opacity-80">{note}</p>
      )}
    </div>
  )
}
