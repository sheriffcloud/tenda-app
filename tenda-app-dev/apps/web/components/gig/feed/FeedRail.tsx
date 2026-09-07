/**
 * The feed's filter rail (#60, correction b): the same sections it always
 * had — Search, Category, Market, Arrangement, Settles on, Sort, Clear — as
 * the preview draws them: every section a run of rows, the rail STICKY
 * beside the scrolling list and scrolling within itself when taller than
 * the viewport.
 *
 * Every control is a link or a form field, so the whole rail works with no
 * client JavaScript and each narrowed view has its own address.
 *
 * The comp puts a COUNT beside each category and toggle. They come from
 * GET /v1/gigs/facets — one request answering every cell, sharing the feed's
 * own base conditions server-side so a number can never disagree with the list
 * beside it. `facets` is null when that read failed, and every cell then draws
 * without a number rather than claiming zero. The MARKET rows carry no count:
 * the comp draws none there.
 */
import Link from 'next/link'
import { CATEGORY_LABELS, GIG_CATEGORIES, type GigFacets } from '@tenda/shared'
import type { GigChainOption } from '@/lib/gigs/data'
import { CATEGORY_TONE } from '@/components/gig/category-icons'
import { ChainBadge } from '@/components/shared/ChainBadge'
import { buttonVariants } from '@/components/ui/Button'
import { marketNames } from '@/lib/markets'
import { cn } from '@/lib/cn'
import {
  GIG_MARKETS,
  GIG_SORTS,
  GIG_SORT_LABELS,
  gigsHref,
  hasActiveFilters,
  type GigFeedFilters,
} from '@/lib/gigs/search-params'
import { FilterRow } from './FilterLink'
import { FeedRailForm } from './FeedRailForm'
import { RailSection } from './RailSection'
import { FEED_COPY } from './copy'

/** Resolved once: the vocabulary is a module constant, not per-render data. */
const MARKET_NAMES = marketNames(GIG_MARKETS)

const ROWS = 'flex flex-col gap-0.5'

export function FeedRail({
  filters,
  chains,
  facets = null,
}: {
  filters: GigFeedFilters
  chains: readonly GigChainOption[]
  /** Null when the counts could not be read; the rail simply omits them. */
  facets?: GigFacets | null
}) {
  return (
    <aside
      aria-label="Filter gigs"
      // Sticky under the site header, capped to the viewport and scrolling
      // inside itself — the reader's filters stay in reach on a long feed.
      className="flex flex-col gap-[22px] [scrollbar-width:thin] lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto lg:pr-1.5"
    >
      <FeedRailForm filters={filters} />

      <RailSection label={FEED_COPY.rail.category}>
        <div className={ROWS}>
          <FilterRow href={gigsHref(filters, { category: null })} active={filters.category === null} label={FEED_COPY.rail.allCategories} />
          {GIG_CATEGORIES.map((category) => (
            <FilterRow
              key={category}
              href={gigsHref(filters, { category })}
              active={filters.category === category}
              dotClassName={CATEGORY_TONE[category].dot}
              count={facets?.category[category]}
              label={CATEGORY_LABELS[category]}
            />
          ))}
        </div>
      </RailSection>

      <RailSection label={FEED_COPY.rail.market}>
        <div className={ROWS}>
          <FilterRow href={gigsHref(filters, { country: null })} active={filters.country === null} label={FEED_COPY.rail.allMarkets} />
          {GIG_MARKETS.map((code, index) => (
            <FilterRow key={code} href={gigsHref(filters, { country: code })} active={filters.country === code} label={MARKET_NAMES[index]} />
          ))}
        </div>
      </RailSection>

      <RailSection label={FEED_COPY.rail.arrangement}>
        <div className={ROWS}>
          {/* Toggles, so a second click clears them — the comp's aria-pressed
              buttons with a filter's URL semantics. */}
          <FilterRow
            href={gigsHref(filters, { remote: filters.remote ? null : 'true' })}
            active={filters.remote}
            count={facets?.remote}
            label={FEED_COPY.rail.remote}
          />
          <FilterRow
            href={gigsHref(filters, { cross_border: filters.cross_border ? null : 'true' })}
            active={filters.cross_border}
            count={facets?.cross_border}
            label={FEED_COPY.rail.crossBorder}
          />
        </div>
      </RailSection>

      {/* Only the chains this deployment actually serves; an unserved id is a
          400, so an empty registry hides the section rather than offering one.
          Each row IS the chain badge (correction c): the same mark the cards
          carry, so the filter and the thing it filters read alike. */}
      {chains.length > 0 && (
        <RailSection label={FEED_COPY.rail.chain}>
          <div className={ROWS}>
            <FilterRow href={gigsHref(filters, { chain_id: null })} active={filters.chain_id === null} label={FEED_COPY.rail.allChains} />
            {chains.map((chain) => (
              <FilterRow key={chain.id} href={gigsHref(filters, { chain_id: chain.id })} active={filters.chain_id === chain.id} label={chain.label}>
                <ChainBadge chainId={chain.id} size="sm" />
              </FilterRow>
            ))}
          </div>
        </RailSection>
      )}

      {/* GIG_LIST_SORTS are the ONLY orderings the index backs (spec-correction
          #11); the default stays off the URL so the canonical feed keeps one
          address and its keyset cursor. */}
      <RailSection label={FEED_COPY.rail.sort}>
        <div className={ROWS}>
          {GIG_SORTS.map((sort) => (
            <FilterRow
              key={sort}
              href={gigsHref(filters, { sort: sort === 'created_at' ? null : sort })}
              active={filters.sort === sort}
              label={GIG_SORT_LABELS[sort]}
            />
          ))}
        </div>
      </RailSection>

      {hasActiveFilters(filters) && (
        <div className="flex border-t border-border-default pt-4">
          <Link href="/" scroll={false} className={cn(buttonVariants({ variant: 'outline', size: 'md' }), 'flex-1')}>
            {FEED_COPY.rail.clear}
          </Link>
        </div>
      )}
    </aside>
  )
}
