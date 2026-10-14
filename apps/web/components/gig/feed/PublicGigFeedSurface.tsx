'use client'

/**
 * The feed's list half (#60): the heading ending on the blue period with the
 * LIVE facts and the keyboard hint on its subline, the list/grid toggle over
 * the same remembered preference /gigs uses, the amount note, then the cards
 * in the chosen density, the pager and the keyboard layer.
 */
import { useState } from 'react'
import type { GigListQuery, PaginatedResponse } from '@tenda/shared'
import { GigsViewToggle } from '@/components/gigs/GigsViewToggle'
import { BrandPeriod } from '@/components/public/BrandPeriod'
import { ChainBadge } from '@/components/shared/ChainBadge'
import { Kbd } from '@/components/ui/Kbd'
import { usePublicGigFeedRealtime } from '@/hooks/gig/usePublicGigFeedRealtime'
import { useGigsView } from '@/lib/gigs/browse-view'
import { gigsHref, hasActiveFilters, type GigFeedFilters } from '@/lib/gigs/search-params'
import { FeedKeyboard } from './FeedKeyboard'
import { FeedPager } from './FeedPager'
import { FeedEmpty, FeedPastEnd, feedListClass } from './FeedStates'
import { GigCard } from './GigCard'
import { FEED_COPY } from './copy'
import type { GigCardModel } from './gig-card-model'

/** The facts beside the count; each `null` is a read that failed and is omitted. */
export interface FeedFacts {
  /** The RUNNING registry's chains, for the glyph run and the count. */
  chainIds: readonly string[]
  markets: number | null
  feeBps: number | null
}

export const NO_FACTS: FeedFacts = { chainIds: [], markets: null, feeBps: null }

export function PublicGigFeedSurface({ page, filters, query, facts = NO_FACTS }: {
  page: PaginatedResponse<GigCardModel>
  filters: GigFeedFilters
  query: GigListQuery
  facts?: FeedFacts
}) {
  const surfaceKey = JSON.stringify([
    query,
    page.total,
    page.next_cursor,
    page.data.map((gig) => [gig.escrow_id, gig.public_feed_revision]),
  ])
  return <PublicGigFeedState key={surfaceKey} page={page} filters={filters} query={query} facts={facts} />
}

function Sep() {
  return <span aria-hidden>·</span>
}

function PublicGigFeedState({ page, filters, query, facts }: {
  page: PaginatedResponse<GigCardModel>
  filters: GigFeedFilters
  query: GigListQuery
  facts: FeedFacts
}) {
  const [live, setLive] = useState({ items: page.data, total: page.total })
  const applyItems = (items: GigCardModel[], membershipDelta: number) => setLive((current) => ({
    items,
    total: Math.max(0, current.total + membershipDelta),
  }))
  usePublicGigFeedRealtime({ items: live.items, query, applyItems })
  const [view] = useGigsView()

  const heading = filters.q === null ? FEED_COPY.feed.heading : FEED_COPY.feed.searchHeading
  return (
    <section data-feed-surface>
      <div className="mb-2 flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <h2 className="type-h2 text-content-primary">
            <BrandPeriod text={`${heading}.`} />
          </h2>
          <p data-feed-facts className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 type-body-small text-content-tertiary">
            <span className="font-numeric text-xs text-content-primary">{FEED_COPY.feed.count(live.total)}</span>
            {facts.chainIds.length > 0 && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1.5">
                  {facts.chainIds.map((id) => (
                    <ChainBadge key={id} chainId={id} size="sm" glyphOnly />
                  ))}
                  {FEED_COPY.feed.chains(facts.chainIds.length)}
                </span>
              </>
            )}
            {facts.markets !== null && (
              <>
                <Sep />
                <span>{FEED_COPY.feed.markets(facts.markets)}</span>
              </>
            )}
            {facts.feeBps !== null && (
              <>
                <Sep />
                <span>{FEED_COPY.feed.fee(facts.feeBps)}</span>
              </>
            )}
            <Sep />
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> {FEED_COPY.feed.keyboardHint.walk} · <Kbd>↵</Kbd>{' '}
              {FEED_COPY.feed.keyboardHint.open}
            </span>
          </p>
        </div>
        <div className="ml-auto">
          <GigsViewToggle />
        </div>
      </div>
      <p className="mb-5 max-w-[78ch] type-body-small text-content-tertiary">{FEED_COPY.feed.amountNote}</p>
      {live.items.length === 0 ? (
        live.total > 0
          ? <FeedPastEnd href={gigsHref(filters)} total={live.total} />
          : <FeedEmpty filtered={hasActiveFilters(filters)} />
      ) : (
        <>
          <ul className={feedListClass(view)} data-view={view}>
            {live.items.map((gig, index) => (
              <li key={gig.escrow_id} className={view === 'grid' ? 'flex' : undefined}>
                <GigCard gig={gig} index={index} density={view === 'grid' ? 'grid' : 'row'} />
              </li>
            ))}
          </ul>
          <FeedPager filters={filters} nextCursor={page.next_cursor} total={live.total} shown={live.items.length} />
          <FeedKeyboard />
        </>
      )}
    </section>
  )
}
