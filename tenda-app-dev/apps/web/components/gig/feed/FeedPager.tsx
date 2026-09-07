/**
 * Paging, in the two modes the API actually offers.
 *
 * The plain recency feed pages by KEYSET CURSOR — stable while gigs are being
 * posted underneath you. A searched or sorted feed cannot: the server refuses
 * a cursor alongside `sort` or `q` and mints none for those responses, so
 * those views page by OFFSET, which `total` makes navigable in both
 * directions.
 *
 * Before this, the "more" link only rendered when a `next_cursor` came back —
 * so searching or sorting silently capped the feed at its first twenty rows
 * with no way forward and no indication that more existed.
 *
 * Drawn as the #60 preview's pager: the position on the left, the outline
 * buttons on the right, one ruled row under the list.
 */
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'
import {
  GIGS_PAGE_SIZE,
  gigsHref,
  usesCursorPaging,
  type GigFeedFilters,
} from '@/lib/gigs/search-params'
import { FEED_COPY } from './copy'

const LINK_CLASS = buttonVariants({ variant: 'outline', size: 'md' })

export function FeedPager({
  filters,
  nextCursor,
  total,
  shown,
}: {
  filters: GigFeedFilters
  /** Only meaningful in cursor mode; null or absent means this is the last page. */
  nextCursor?: string | null
  total: number
  /** Rows on THIS page — a short page is the last one in offset mode. */
  shown: number
}) {
  if (usesCursorPaging(filters)) {
    if (nextCursor === null || nextCursor === undefined || nextCursor === '') return null
    return (
      <nav className="mt-[22px] flex items-center" aria-label="Feed pages">
        <Link href={gigsHref(filters, { cursor: nextCursor })} className={`${LINK_CLASS} ml-auto`}>
          {FEED_COPY.pager.next}
          <ChevronRight size={16} aria-hidden />
        </Link>
      </nav>
    )
  }

  const { offset } = filters
  const hasPrevious = offset > 0
  // `total` counts the whole filtered set, so it — not the page length — says
  // whether anything follows. A page that happens to be exactly full is not
  // evidence of a next page.
  const hasNext = offset + shown < total
  if (!hasPrevious && !hasNext) return null

  const page = Math.floor(offset / GIGS_PAGE_SIZE) + 1
  const pages = Math.max(1, Math.ceil(total / GIGS_PAGE_SIZE))

  return (
    <nav className="mt-[22px] flex flex-wrap items-center gap-3" aria-label="Feed pages">
      <p className="font-numeric type-body-small text-content-tertiary">
        {FEED_COPY.pager.position(page, pages)}
      </p>
      <span className="ml-auto flex gap-2">
        {hasPrevious && (
          <Link
            href={gigsHref(filters, { offset: String(Math.max(0, offset - GIGS_PAGE_SIZE)) })}
            className={LINK_CLASS}
          >
            <ChevronLeft size={16} aria-hidden />
            {FEED_COPY.pager.previous}
          </Link>
        )}
        {hasNext && (
          <Link
            href={gigsHref(filters, { offset: String(offset + GIGS_PAGE_SIZE) })}
            className={LINK_CLASS}
          >
            {FEED_COPY.pager.next}
            <ChevronRight size={16} aria-hidden />
          </Link>
        )}
      </span>
    </nav>
  )
}
