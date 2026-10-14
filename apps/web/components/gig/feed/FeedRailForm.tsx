/**
 * Search, as one GET form to the root feed.
 *
 * The GET form keeps search functional without JavaScript; the noscript
 * button remains the fallback for readers with none. Sort left this form in
 * #60 — it is a run of links in the rail now, like every other filter — so
 * the form carries it as a hidden field the way it carries the rest.
 *
 * Filters the form has no input for (category, market, chain, arrangement,
 * sort) ride along as hidden fields. Without them a search would silently
 * clear the category the user picked one control above.
 */
import { Search } from 'lucide-react'
import type { GigFeedFilters } from '@/lib/gigs/search-params'
import { RailSection } from './RailSection'
import { FEED_COPY } from './copy'

/** The filters carried as hidden fields, in a stable order. */
export function hiddenFields(filters: GigFeedFilters): Array<[string, string]> {
  const fields: Array<[string, string]> = []
  if (filters.category !== null) fields.push(['category', filters.category])
  if (filters.country !== null) fields.push(['country', filters.country])
  if (filters.city !== null) fields.push(['city', filters.city])
  if (filters.chain_id !== null) fields.push(['chain_id', filters.chain_id])
  if (filters.remote) fields.push(['remote', 'true'])
  if (filters.cross_border) fields.push(['cross_border', 'true'])
  // The default ordering stays OFF the URL so the canonical feed keeps one
  // address (see gigsHref) — and, on the wire, its keyset cursor.
  if (filters.sort !== 'created_at') fields.push(['sort', filters.sort])
  return fields
}

export function FeedRailForm({ filters }: { filters: GigFeedFilters }) {
  return (
    <form method="get" action="/" className="flex flex-col gap-3">
      {hiddenFields(filters).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <RailSection label={FEED_COPY.rail.search} htmlFor="gig-q">
        <div className="flex h-[38px] items-center gap-2 rounded-sm bg-control-input-background px-3 focus-within:ring-2 focus-within:ring-brand-focus-ring">
          <Search size={15} aria-hidden className="shrink-0 text-content-tertiary" />
          <input
            id="gig-q"
            type="search"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder={FEED_COPY.rail.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent type-body-small text-control-input-text outline-none placeholder:text-control-input-placeholder"
          />
        </div>
      </RailSection>

      <noscript>
        <button
          type="submit"
          className="rounded-control bg-brand-solid px-4 py-2 text-sm font-bold text-brand-on-primary"
        >
          {FEED_COPY.rail.apply}
        </button>
      </noscript>
    </form>
  )
}
