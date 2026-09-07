import type { Metadata } from 'next'
import { APP_INFO } from '@tenda/shared'
import { FeedHero } from '@/components/gig/feed/FeedHero'
import { FeedRail } from '@/components/gig/feed/FeedRail'
import { FeedErrorStatic } from '@/components/gig/feed/FeedStates'
import { PublicGigFeedSurface, type FeedFacts } from '@/components/gig/feed/PublicGigFeedSurface'
import { toGigCardModel } from '@/components/gig/feed/gig-card-model'
import {
  listEnabledChains,
  listGigFacetsOnce,
  listGigsOnce,
  readPlatformConfigOnce,
} from '@/lib/gigs/data'
import {
  gigsHref,
  parseGigFeedFilters,
  toGigFacetsQuery,
  toGigListQuery,
  type RawSearchParams,
} from '@/lib/gigs/search-params'

/**
 * A canonical per view, because the rail links a combinatorial URL space and
 * `robots.txt` allows all of it.
 *
 * `gigsHref` is the normalisation, reused rather than re-derived: it drops the
 * two POSITION keys and the redundant default sort, and keeps genuine filters.
 * So `/`, `/?offset=0` and `/?q=` — which serve byte-identical
 * rendered content today, verified — collapse to one address, while
 * `/?category=photo` stays its own page, which it is.
 *
 * Deliberately NOT a blanket `noindex` on filtered views: whether a category
 * or market slice deserves to rank is a product call, and a canonical makes no
 * claim either way. It only stops the same page from competing with itself.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}): Promise<Metadata> {
  const [params, chains] = await Promise.all([searchParams, listEnabledChains()])
  const filters = parseGigFeedFilters(params, new Set(chains.map((chain) => chain.id)))
  const page = await listGigsOnce(toGigListQuery(filters))
  return {
    title: 'Browse gigs',
    description: APP_INFO.description,
    alternates: { canonical: gigsHref(filters) },
    // An outage renders an honest error state at HTTP 200 (see the page), and
    // a 200 is indexable. This is the only thing standing between a crawler
    // and "We could not load the feed" as the front door's cached content.
    ...(page === null ? { robots: { index: false, follow: true } } : {}),
  }
}

/**
 * Tier-1 public feed — server-rendered, anonymous, indexable. Every filter is
 * a URL search param, so the page needs no client JS to work and each
 * narrowed view has its own address. The hydrated list applies safe events
 * immediately, then reconciles this server result authoritatively.
 */
export default async function PublicGigFeedPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const [params, chains] = await Promise.all([searchParams, listEnabledChains()])
  const filters = parseGigFeedFilters(params, new Set(chains.map((chain) => chain.id)))
  // Concurrent: the rail's counts and the fee are SECOND reads, and awaiting
  // them after the feed would add their latency to a page that already has
  // its content.
  const [page, facets, config] = await Promise.all([
    listGigsOnce(toGigListQuery(filters)),
    listGigFacetsOnce(toGigFacetsQuery(filters)),
    readPlatformConfigOnce(),
  ])

  // Handled HERE rather than by `error.tsx`, which is a client component: its
  // fallback arrives with the hydration script, so a failed read rendered a
  // blank page for a reader with no JavaScript — measured, on the one surface
  // whose premise is that it works without the bundle. `error.tsx` stays for
  // anything thrown elsewhere in the tree. `generateMetadata` marks this
  // render noindex, since it answers 200.
  if (page === null) {
    return (
      <div className="mx-auto w-full max-w-content px-6 pb-20 pt-10">
        <FeedErrorStatic href={gigsHref(filters)} />
      </div>
    )
  }

  const query = toGigListQuery(filters)
  // The LIVE facts on the heading's subline (#60): chains from the running
  // registry, markets from the facets (countries with a gig in them — remote
  // gigs sit in no bucket, so this is not the size of the feed), the fee from
  // platform config. Each is omitted, never invented, when its read failed.
  const facts: FeedFacts = {
    chainIds: chains.map((chain) => chain.id),
    markets: facets === null ? null : Object.values(facets.country).filter((n) => n > 0).length,
    feeBps: config?.fee_bps ?? null,
  }

  return (
    <>
      <FeedHero />
      <div className="mx-auto w-full max-w-content px-6 pb-20">
        <div className="grid grid-cols-1 items-start gap-10 border-t border-border-default pt-[22px] lg:grid-cols-[240px_minmax(0,1fr)]">
          <FeedRail filters={filters} chains={chains} facets={facets} />

          <PublicGigFeedSurface
            page={{ ...page, data: page.data.map(toGigCardModel) }}
            filters={filters}
            query={query}
            facts={facts}
          />
        </div>
      </div>
    </>
  )
}
