import { cache } from 'react'
import {
  ApiClientError,
  type GigDetail,
  type GigFacets,
  type GigFacetsQuery,
  type GigListQuery,
  type GigSummary,
  type PaginatedResponse,
  type PlatformConfig,
} from '@tenda/shared'
import { api } from '@/api/client'

/**
 * Server-side data seam for the public gig surfaces. EVERY call here is
 * ANONYMOUS by construction — they run inside server components, where the
 * storage shim returns null and no bearer is ever attached, so party-scoped
 * fields arrive withheld and nothing private can reach crawler-visible HTML.
 *
 * Caching decision (stage-1 doc asks for it to be stated): none. Every request
 * re-fetches — gig state moves and a takedown must 404 immediately, never be
 * served from a stale page. Revisit with `use cache` + a short cacheLife only
 * if feed traffic ever makes this the bottleneck.
 */
export function listGigs(query: GigListQuery): Promise<PaginatedResponse<GigSummary>> {
  return api.gigs.list(query)
}

/**
 * The feed read as the PAGE needs it: one fetch per request, shared with
 * `generateMetadata`, and `null` rather than a throw when the index is down.
 *
 * Null, not an exception, because the alternative is the route error boundary
 * — and that is a CLIENT component, so with JavaScript off a failed read
 * rendered a blank page (see FeedErrorStatic). Answering the same `null` to
 * both callers lets the page render an honest state server-side and lets
 * `generateMetadata` mark that render `noindex`, which a 200 carrying an error
 * message otherwise would not be.
 *
 * `cache()` keys on argument identity, and the two callers each build their own
 * query object — so the KEY is the serialised query and the object is rebuilt
 * inside. `toGigListQuery` writes its fields in a fixed literal order, which is
 * what makes the serialisation stable; it is the single producer of this shape.
 *
 * The dedupe is a NEXT-RUNTIME property — React `cache()` needs a request
 * scope, which the unit harness does not provide, so it is not asserted there.
 * Measured against a running production build instead: one root-feed render, one
 * `/v1/gigs` hit, with `generateMetadata` and the page both calling this.
 */
const listGigsByKey = cache(
  async (key: string): Promise<PaginatedResponse<GigSummary> | null> => {
    try {
      const page = await api.gigs.list(JSON.parse(key) as GigListQuery)
      // The ONE assumption the page then dereferences. Deliberately not schema
      // validation of the whole envelope — the wire contract is held by types
      // and by a stub typed against them (e2e/fixtures/gigs.ts), and runtime
      // validation everywhere would be a different architecture. But a 200
      // carrying valid JSON of the WRONG shape — a proxy's own response, a
      // stale NEXT_PUBLIC_API_URL — reaches `page.data.map` and throws inside
      // the render, which lands on the client error boundary and so shows a
      // reader with no JavaScript a blank page. Measured. One guard converts
      // that into the honest error state the other failures already get.
      return Array.isArray(page?.data) ? page : null
    } catch {
      return null
    }
  },
)

export function listGigsOnce(query: GigListQuery): Promise<PaginatedResponse<GigSummary> | null> {
  return listGigsByKey(JSON.stringify(query))
}

/**
 * The rail's counts. `null` on ANY failure, and the rail then draws its cells
 * with no numbers.
 *
 * That is the whole error policy, and it is deliberate: the counts are an
 * enhancement on a page whose premise is that it works without JavaScript and
 * without much luck. A feed that 500s because a secondary aggregate timed out
 * would trade the primary content for a decoration. Same `cache()` treatment
 * as the feed read so a re-render inside one request cannot fetch twice.
 */
const facetsByKey = cache(async (key: string): Promise<GigFacets | null> => {
  try {
    const facets = await api.gigs.facets(JSON.parse(key) as GigFacetsQuery)
    // Same one-assumption guard as the feed above: a 200 of the WRONG shape
    // (a proxy's own body, a stale API URL) would otherwise reach
    // `facets.category[key]` inside the render and blank the page for a
    // reader with no JavaScript.
    return typeof facets?.category === 'object' && facets.category !== null ? facets : null
  } catch {
    return null
  }
})

export function listGigFacetsOnce(query: GigFacetsQuery): Promise<GigFacets | null> {
  return facetsByKey(JSON.stringify(query))
}

/**
 * Wrapped in React cache() so generateMetadata and the page body share ONE
 * fetch per request (the OG tags must come from the same read that renders
 * the body). Plain fetch memoization is not relied on: api/request attaches a
 * fresh AbortSignal per call, which can opt a request out of it.
 *
 * Returns null on 404 — the route maps that to notFound(). A hidden gig is
 * already a 404 for anonymous readers server-side.
 */
export const getGig = cache(async (id: string): Promise<GigDetail | null> => {
  try {
    return await api.gigs.get({ id })
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 404) return null
    throw error
  }
})

/**
 * The platform fee for the feed heading's facts line (#60) — a LIVE read of
 * GET /v1/platform/config, one of the three public endpoints the Next server
 * may call (CLAUDE.md). `null` on any failure or a 200 of the wrong shape:
 * the heading then omits the fee rather than printing the static copy figure
 * as if it were live. Same `cache()` treatment as the other reads.
 */
const platformConfigOnce = cache(async (): Promise<PlatformConfig | null> => {
  try {
    const config = await api.platform.config()
    return typeof config?.fee_bps === 'number' ? config : null
  } catch {
    return null
  }
})

export function readPlatformConfigOnce(): Promise<PlatformConfig | null> {
  return platformConfigOnce()
}

/** A chain the RUNNING deployment actually serves, as the filter offers it. */
export interface GigChainOption {
  id: string
  label: string
}

/**
 * Chains for the feed's filter — from GET /v1/platform/chains (the running
 * registry), NOT the static CHAIN_MANIFEST. The server 400s a chain_id it
 * does not serve (lib/chain-filter.ts), so offering a manifest chain that is
 * not provisioned here (solana:mainnet on a devnet deployment) would turn a
 * filter click into an error page. Empty on failure — the filter hides
 * rather than offering options that might 400.
 */
export const listEnabledChains = cache(async (): Promise<GigChainOption[]> => {
  try {
    const { data } = await api.platform.chains()
    return data.map((chain) => ({ id: chain.id, label: chain.display_name }))
  } catch {
    return []
  }
})
