/**
 * The four row fills. Each maps a domain object onto RowChassis slots and
 * owns nothing else — no selection logic, no truncation, no aria contract.
 *
 * Every display value comes from a shared helper (names, relative time, money)
 * rather than being re-derived here, so a row can never disagree with the
 * detail pane it opens.
 */
import {
  STATUS_BADGE_VARIANT,
  STATUS_LABEL,
  displayName,
  formatAssetAmount,
  formatReviewScore,
  type EscrowStatus,
  type GigCategory,
} from '@tenda/shared'
import { CATEGORY_ICONS, CATEGORY_TONE } from '@/components/gig/category-icons'
import { GIG_CARD_COPY, gigTakeVerb } from '@/components/gig/feed/card-copy'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { RelativeTime } from '@/components/ui/RelativeTime'
import type { ReactNode } from 'react'
import { RowChassis } from './RowChassis'

interface Party {
  id: string
  first_name: string | null
  last_name: string | null
  avatar_url?: string | null
}

/** A gig's poster in the meta footer — `review_score` rides along so the row
 *  can say what the feed card says (formatted by the SHARED helper, and
 *  absent means unrated, never scored zero). */
interface MetaCreator extends Party {
  review_score: string | null
}

const nameOf = (party: Party) => displayName(party.first_name, party.last_name, party.id)

export function ConversationRow({
  href,
  party,
  preview,
  at,
  unread = false,
  selected = false,
  arriving = false,
}: {
  href: string
  party: Party
  preview: string
  at?: string | null
  unread?: boolean
  selected?: boolean
  arriving?: boolean
}) {
  const name = nameOf(party)
  return (
    <RowChassis
      href={href}
      selected={selected}
      unread={unread}
      arriving={arriving}
      label={`${name}${unread ? ', unread' : ''}: ${preview}`}
      lead={<Avatar size="sm" name={name} src={party.avatar_url} />}
      eyebrow={name}
      time={at ? <RelativeTime iso={at} /> : undefined}
      title={preview}
    />
  )
}

export function EscrowRow({
  href,
  title,
  status,
  category,
  amountRaw,
  asset,
  subtitle,
  at,
  creator,
  requiresApproval,
  selected = false,
  arriving = false,
}: {
  href: string
  title: string
  status: EscrowStatus
  /** Drives the comps' tinted leading glyph. Omit where there is no category. */
  category?: GigCategory | null
  amountRaw?: string | null
  asset?: string | null
  /** A node, so a variant can set the chain as the shared badge (#60). */
  subtitle?: ReactNode
  at?: string | null
  /** Fills the meta footer with who posted it (+ their rating). Omit where
   *  the reader IS the poster — telling someone their own name is furniture. */
  creator?: MetaCreator
  /** Browse surfaces only: draws the Apply|Accept chip, the same wire fact
   *  the feed card shows — finding out after committing is a bait-and-switch. */
  requiresApproval?: boolean
  selected?: boolean
  arriving?: boolean
}) {
  const amount =
    amountRaw != null && asset != null ? formatAssetAmount(amountRaw, asset) : undefined
  const creatorName = creator === undefined ? undefined : nameOf(creator)
  const rating = creator === undefined ? null : formatReviewScore(creator.review_score)
  const takeVerb = requiresApproval === undefined ? undefined : gigTakeVerb(requiresApproval)
  // Resolved through the existing CATEGORY_ICONS registry, which is built
  // from shared CATEGORY_META and throws on an unmapped category — the row
  // must not become a second place category visuals can drift.
  // Built inside a narrowing branch rather than with a cast: `category` is
  // GigCategory here by control flow, not by assertion.
  let lead: ReactNode
  if (category != null) {
    const CategoryIcon = CATEGORY_ICONS[category]
    lead = (
      <CategoryIcon size={16} aria-hidden className={`shrink-0 ${CATEGORY_TONE[category].text}`} />
    )
  }
  return (
    <RowChassis
      href={href}
      selected={selected}
      arriving={arriving}
      // The meta facts belong in the name too — a sightless reader deciding
      // whether to open a gig needs who posted it and how it is taken.
      label={`${title}, ${STATUS_LABEL[status]}${amount === undefined ? '' : `, ${amount}`}${
        creatorName === undefined ? '' : `, by ${creatorName}`
      }${takeVerb === undefined ? '' : `, ${takeVerb}`}`}
      lead={lead}
      time={at ? <RelativeTime iso={at} /> : undefined}
      title={title}
      // Tone comes from the shared vocabulary, so a row's badge matches the
      // same status everywhere else it appears.
      badge={<Badge variant={STATUS_BADGE_VARIANT[status]} label={STATUS_LABEL[status]} />}
      subtitle={subtitle}
      amount={amount}
      meta={
        creator === undefined && takeVerb === undefined ? undefined : (
          <>
            {creator !== undefined && creatorName !== undefined && (
              <>
                <Avatar size="sm" name={creatorName} src={creator.avatar_url} />
                <span className="min-w-0 truncate type-body-small font-semibold text-content-secondary">
                  {creatorName}
                </span>
                {rating !== null && (
                  <span
                    className="shrink-0 whitespace-nowrap font-numeric text-xs leading-4 text-content-tertiary"
                    aria-label={GIG_CARD_COPY.ratingLabel(rating)}
                  >
                    ★ {rating}
                  </span>
                )}
              </>
            )}
            {takeVerb !== undefined && (
              <span className="ml-auto shrink-0 rounded-full bg-surface-inset px-2.5 py-[3px] text-xs font-bold leading-4 text-content-secondary">
                {takeVerb}
              </span>
            )}
          </>
        )
      }
    />
  )
}

export function NotificationRow({
  href,
  title,
  body,
  at,
  unread = false,
  selected = false,
  arriving = false,
}: {
  href: string
  title: string
  body?: string
  at?: string | null
  unread?: boolean
  selected?: boolean
  arriving?: boolean
}) {
  return (
    <RowChassis
      href={href}
      selected={selected}
      unread={unread}
      arriving={arriving}
      label={`${title}${unread ? ', unread' : ''}`}
      time={at ? <RelativeTime iso={at} /> : undefined}
      title={title}
      subtitle={body}
    />
  )
}

export function ApplicantRow({
  href,
  party,
  note,
  at,
  selected = false,
  arriving = false,
}: {
  href: string
  party: Party
  note?: string
  at?: string | null
  selected?: boolean
  arriving?: boolean
}) {
  const name = nameOf(party)
  return (
    <RowChassis
      href={href}
      selected={selected}
      arriving={arriving}
      label={`Applicant ${name}`}
      lead={<Avatar size="sm" name={name} src={party.avatar_url} />}
      eyebrow={name}
      time={at ? <RelativeTime iso={at} /> : undefined}
      title={note ?? name}
    />
  )
}
