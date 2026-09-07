/**
 * The detail's opening block (Tier 1 comp, lines 571-599): breadcrumb,
 * taxonomy line, headline, and the facts a reader checks before scrolling —
 * where, when, which chain, and whether it crosses a border.
 *
 * One hairline card (#60): the brand-tinted gradient is gone — blue is a
 * point on this page, never a wash — and the settlement chain joined the
 * facts row as the shared badge, so the header names the network the way
 * the card that led here did.
 */
import Link from 'next/link'
import {
  CATEGORY_LABELS,
  gigPlaceLabel,
  type GigDetail,
} from '@tenda/shared'
import { ChevronRight, Clock, Globe, MapPin } from 'lucide-react'
import { CATEGORY_ICONS, CATEGORY_TONE } from '@/components/gig/category-icons'
import { ChainBadge } from '@/components/shared/ChainBadge'
import { Eyebrow, RelativeTime } from '@/components/ui'
import { gigsHref, parseGigFeedFilters } from '@/lib/gigs/search-params'
import { GIG_DETAIL_COPY } from './copy'

/**
 * The category crumb links to the FEED filtered by that category — the comp's
 * `categoryHref`. Built through gigsHref off an empty filter set so the link
 * obeys the same URL contract as the rail, rather than being hand-assembled
 * into a query string that could drift from it.
 */
function categoryHref(gig: GigDetail): string {
  return gigsHref(parseGigFeedFilters({}, new Set()), { category: gig.category })
}

export function GigDetailHeader({ gig }: { gig: GigDetail }) {
  const CategoryIcon = CATEGORY_ICONS[gig.category]
  const tone = CATEGORY_TONE[gig.category]

  return (
    <header className="rounded-card border border-border-subtle bg-surface-card px-5 py-5 shadow-card sm:px-7 sm:py-[26px]">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 type-body-small font-semibold text-content-tertiary"
      >
        <Link href="/" className="hover:text-content-primary">
          {GIG_DETAIL_COPY.breadcrumbRoot}
        </Link>
        <ChevronRight size={14} aria-hidden />
        <Link href={categoryHref(gig)} className="hover:text-content-primary">
          {CATEGORY_LABELS[gig.category]}
        </Link>
        <ChevronRight size={14} aria-hidden />
        {/* The escrow id is the thing a reader quotes to support, so it is
            shown in full and in mono rather than truncated to look tidy. */}
        <span className="break-all font-numeric type-caption">{gig.escrow_id}</span>
      </nav>

      <div className="mt-[22px] flex items-center gap-1.5">
        <CategoryIcon size={14} aria-hidden className={`shrink-0 ${tone.text}`} />
        <Eyebrow as="span" className={tone.text}>
          {CATEGORY_LABELS[gig.category]}
        </Eyebrow>
      </div>

      {/* Poster-written, and set large — the width a single unbroken token
          needs here is enormous. `break-words` only acts when it would
          otherwise overflow. See CLAUDE.md, "text a poster wrote". */}
      <h1 className="mt-3.5 text-balance break-words font-display text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-content-primary sm:text-[clamp(30px,3.2vw,40px)]">
        {gig.title}
      </h1>

      <div className="mt-[18px] flex flex-wrap items-center gap-5 text-sm leading-5 text-content-secondary">
        {/* `city` is free text a poster typed, so this chip has to survive a
            57-character place name. It BREAKS rather than truncates: on the
            detail page the location is a fact the reader is deciding on, and
            half of it is worse than a taller line. */}
        <span className="flex min-w-0 items-center gap-[7px]">
          <MapPin size={15} aria-hidden className="shrink-0 text-content-tertiary" />
          <span className="min-w-0 break-words">{gigPlaceLabel(gig)}</span>
        </span>
        <span className="flex items-center gap-[7px]">
          <Clock size={15} aria-hidden className="text-content-tertiary" />
          {GIG_DETAIL_COPY.postedPrefix}{' '}
          <RelativeTime iso={gig.created_at} className="font-numeric" />
        </span>
        <ChainBadge chainId={gig.chain_id} />
        {gig.cross_border && (
          <span className="flex items-center gap-1.5 rounded-full border border-feedback-info-border bg-feedback-info-surface px-2.5 py-0.5 text-[11px] font-semibold leading-4 text-feedback-info-text">
            <Globe size={12} aria-hidden />
            {GIG_DETAIL_COPY.crossBorder}
          </span>
        )}
      </div>
    </header>
  )
}
