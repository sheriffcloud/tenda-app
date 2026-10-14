/**
 * The feed card, in the two densities the #60 preview draws: a GRID card (a
 * hairline receipt-style card in the card grid) and a ROW (one hairline row
 * of the list, the same information laid across three columns). Listing
 * fields only — the public feed serves anonymous readers, and nothing
 * party-scoped exists on `GigSummary` to leak.
 *
 * `requires_approval` decides whether the action reads Apply or Accept, and it
 * is shown while BROWSING on purpose (shared GigSummary doc): finding out
 * after tapping Accept is a bait-and-switch.
 *
 * The top-right slot holds the accept WINDOW beside the settlement CHAIN.
 * Every gig in this feed is `open` by construction, so a status badge would be
 * a constant; the window is the one thing about an open gig that changes, and
 * the chain decides whether the reader holds a wallet that can take the gig
 * at all — drawn through the shared ChainBadge so it is OBVIOUS (correction c),
 * not a grey label. The grid AREAS live in app/globals.css: the row template
 * only applies from `sm` up, below which both densities stack the same way,
 * so a 320px phone never sees three columns fighting for 272px.
 */
import Link from 'next/link'
import {
  AGENT_BADGE_LABEL,
  CATEGORY_LABELS,
  acceptWindowState,
  displayName,
  formatReviewScore,
  gigPlaceLabel,
  type GigSummary,
} from '@tenda/shared'
import { MapPin } from 'lucide-react'
import { CATEGORY_ICONS, CATEGORY_TONE } from '@/components/gig/category-icons'
import { ChainBadge } from '@/components/shared/ChainBadge'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Eyebrow, RelativeTime } from '@/components/ui'
import { cn } from '@/lib/cn'
import { GIG_CARD_COPY, gigTakeVerb } from './card-copy'
import { toGigCardModel, type GigCardModel } from './gig-card-model'

export type GigCardDensity = 'grid' | 'row'

const VERB_CLASS =
  'shrink-0 rounded-full bg-surface-inset px-2.5 py-[3px] text-xs font-bold leading-4 text-content-secondary'

export function GigCard({
  gig: input,
  index,
  density = 'grid',
  href,
}: {
  gig: GigCardModel | GigSummary
  index?: number
  density?: GigCardDensity
  /** Where the card goes; the public listing by default, `/gigs/<id>` in the workspace grid. */
  href?: string
}) {
  const gig = 'amount_raw' in input ? toGigCardModel(input) : input
  const CategoryIcon = CATEGORY_ICONS[gig.category]
  const tone = CATEGORY_TONE[gig.category]
  const creatorName = displayName(gig.creator.first_name, gig.creator.last_name, gig.creator.id)
  const rating = formatReviewScore(gig.creator.review_score)
  const acceptWindow = acceptWindowState(gig)
  const row = density === 'row'
  const verb = <span className={cn(VERB_CLASS, 'ml-auto')}>{gigTakeVerb(gig.requires_approval)}</span>

  return (
    <Link
      href={href ?? `/gig/${gig.escrow_id}`}
      // The feed's keyboard layer walks these; the index makes "the third
      // card" addressable without the enhancement owning a list of ids.
      data-gig-card={index}
      data-gig-density={density}
      // `min-w-0` is load-bearing, not tidiness: a grid item defaults to
      // `min-width:auto`, and `overflow-wrap` on the title does NOT reduce
      // min-content, so without it the card sizes to the longest unbreakable
      // token a poster wrote and drags the grid track out with it. Measured.
      className={cn(
        'grid min-w-0 transition-[border-color,box-shadow,background-color] duration-(--motion-fast) ease-(--motion-ease-standard)',
        row
          ? 'items-center gap-x-6 gap-y-1 border-b border-border-subtle px-1.5 py-3.5 hover:rounded-sm hover:bg-surface-inset'
          : 'h-full gap-x-2 gap-y-1.5 rounded-card border border-border-subtle bg-surface-card px-[18px] pb-4 pt-[18px] shadow-card hover:border-border-strong hover:shadow-elevated',
      )}
    >
      <span className="flex min-w-0 items-center gap-2 [grid-area:meta]">
        <CategoryIcon size={14} aria-hidden className={`shrink-0 ${tone.text}`} />
        {/* No `truncate`: every CATEGORY_LABELS entry is one short word. */}
        <Eyebrow as="span" className={tone.text}>
          {CATEGORY_LABELS[gig.category]}
        </Eyebrow>
      </span>

      {/* Its own grid area, so the category can never be squeezed to
          "DELIVE…" by the pair — and `flex-wrap` so the window badge drops
          under the chain pill on the 272px card a 320px phone gets. */}
      <span className="flex flex-wrap items-center justify-end gap-1.5 justify-self-end [grid-area:chain]">
        <ChainBadge chainId={gig.chain_id} />
        {acceptWindow === 'closing' ? (
          <Badge variant="warning" label={GIG_CARD_COPY.closingSoon} />
        ) : (
          <Badge variant="success" label={GIG_CARD_COPY.open} />
        )}
      </span>

      {/* `break-words`: the title is POSTER-WRITTEN and routinely contains a
          pasted link; a row keeps to one line instead (see CLAUDE.md, "text a
          poster wrote" — a feed row truncates, the detail page breaks). */}
      <h3
        className={cn(
          'min-w-0 font-display text-base font-semibold leading-[22px] text-content-primary [grid-area:title]',
          row ? 'truncate' : 'mt-1.5 text-pretty break-words',
        )}
      >
        {gig.title}
      </h3>

      <span
        className={cn(
          'flex items-baseline font-numeric font-semibold text-utility-money [grid-area:amt]',
          row ? 'text-lg leading-6 sm:justify-self-end' : 'mt-1.5 text-2xl leading-7',
        )}
      >
        {gig.displayAmount}
        {/* A real space between the two halves: whitespace-only text between
            flex items is not rendered, but without it `textContent` reads
            "25USDC" to a copy-paste and any scraper. */}{' '}
        <span className="ml-1.5 type-caption text-content-tertiary">
          {gig.displaySymbol}
        </span>
      </span>

      <span
        className={cn(
          'flex min-w-0 items-center gap-1.5 text-xs leading-4 text-content-tertiary [grid-area:time]',
          row && 'sm:justify-self-end',
        )}
      >
        <MapPin size={13} aria-hidden className="shrink-0" />
        {/* `min-w-0` so `truncate` can act — `city` is free text a poster typed. */}
        <span className="min-w-0 truncate">{gigPlaceLabel(gig)}</span>
        <span aria-hidden>·</span>
        <RelativeTime iso={gig.created_at} className="whitespace-nowrap font-numeric" />
        {row && verb}
      </span>

      <span
        className={cn(
          'flex min-w-0 items-center gap-2 type-body-small text-content-tertiary [grid-area:foot]',
          !row && 'mt-2.5 border-t border-border-subtle pt-3',
        )}
      >
        <Avatar size="sm" name={creatorName} src={gig.creator.avatar_url} />
        <span className="min-w-0 truncate font-semibold text-content-secondary">{creatorName}</span>
        {/* Software posted this: said where the name is, with the shared words. */}
        {gig.creator.is_agent && <Badge variant="brand" label={AGENT_BADGE_LABEL} />}
        {rating !== null && (
          <span
            className="shrink-0 whitespace-nowrap font-numeric text-xs leading-4"
            aria-label={GIG_CARD_COPY.ratingLabel(rating)}
          >
            ★ {rating}
          </span>
        )}
        {!row && verb}
      </span>
    </Link>
  )
}
