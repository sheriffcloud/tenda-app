/**
 * The rail's one selectable shape since #60: a full-width ROW. Every section
 * — category, market, arrangement, chain, sort — is a list of these, as the
 * preview draws them. Links, never buttons: a filter is a URL here, so every
 * narrowed view is linkable, indexable, and survives the back button with no
 * client state at all.
 *
 * `aria-current="true"` rather than the comps' `aria-pressed`: pressed
 * describes a toggle BUTTON, and announcing a link as pressed tells a screen
 * reader user the wrong control is under them. Current is the attribute for
 * "this is the view you are on".
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { FEED_COPY } from './copy'

export function FilterRow({
  href,
  active,
  dotClassName,
  count,
  label,
  children,
}: {
  href: string
  active: boolean
  /** Category tone dot. Omitted where the row has no taxonomy colour. */
  dotClassName?: string
  /**
   * How many gigs this row leads to. `undefined` when the counts could not be
   * read — the row then renders without one, which is why this is optional
   * rather than defaulted to 0: an outage must not claim there is nothing
   * there.
   */
  count?: number
  /**
   * The row's plain text, always: with a count present the row states its
   * accessible name EXPLICITLY (below), and that name has to be buildable
   * even when the rendered content is a node (a chain badge).
   */
  label: string
  /** Rendered content; the label itself when omitted. */
  children?: ReactNode
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      // Name-from-content would concatenate the label and the numeral with no
      // separator — "Delivery7 gigs" — because each child's contribution is
      // trimmed before joining. Stating the name outright also says what the
      // number COUNTS, which a bare "Delivery 7" never does. The pluralisation
      // is the feed's existing one rather than a second copy of the rule.
      aria-label={count === undefined ? undefined : `${label} ${FEED_COPY.feed.count(count)}`}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-xs px-2.5 text-sm font-medium transition-colors duration-(--motion-fast) ease-(--motion-ease-standard)',
        active
          ? 'bg-surface-inset text-content-primary'
          : 'text-content-secondary hover:bg-surface-inset hover:text-content-primary',
      )}
    >
      {dotClassName !== undefined && (
        <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', dotClassName)} />
      )}
      <span className="min-w-0 flex-1 truncate text-left">{children ?? label}</span>
      {count !== undefined && (
        <span className="font-numeric text-xs tabular-nums text-content-tertiary">{count}</span>
      )}
    </Link>
  )
}
