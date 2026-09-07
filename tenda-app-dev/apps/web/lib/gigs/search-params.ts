import {
  GIG_CATEGORIES,
  LOCATIONS,
  type GigCategory,
  type GigFacetsQuery,
  type GigListQuery,
} from '@tenda/shared'

/** The raw shape Next resolves from a page's `searchParams` promise. */
export type RawSearchParams = Record<string, string | string[] | undefined>

export const GIGS_PAGE_SIZE = 20

/**
 * Feed orderings, and the ONLY ones — `GigListQuery.sort` accepts exactly
 * these three. The comps' rail offers a fourth, "Accept deadline", which no
 * index and no sort value backs (spec-correction #11); sorting a single page
 * of it client-side would order twenty rows and silently mis-order the rest.
 */
export const GIG_SORTS = ['created_at', 'amount_desc', 'amount_asc'] as const
export type GigSort = (typeof GIG_SORTS)[number]

/** Rail labels. Recency is the default, so it is the one with no param. */
export const GIG_SORT_LABELS: Record<GigSort, string> = {
  created_at: 'Newest first',
  amount_desc: 'Amount: high to low',
  amount_asc: 'Amount: low to high',
}

/** ISO-3166 alpha-2 codes the product serves, from the shared vocabulary. */
export const GIG_MARKETS = Object.keys(LOCATIONS)

/** The filters the public feed exposes, all URL-addressable so views are linkable. */
export interface GigFeedFilters {
  category: GigCategory | null
  country: string | null
  city: string | null
  chain_id: string | null
  remote: boolean
  cross_border: boolean
  q: string | null
  sort: GigSort
  cursor: string | null
  offset: number
}

/** Every filter key the URL carries, so href-building can never miss one. */
type FilterParam = 'category' | 'country' | 'city' | 'chain_id' | 'remote' | 'cross_border' | 'q' | 'sort'
/** Filter keys plus the two position keys, which behave differently (see gigsHref). */
export type GigFeedParam = FilterParam | 'cursor' | 'offset'

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function isSort(value: string | undefined): value is GigSort {
  return value !== undefined && (GIG_SORTS as readonly string[]).includes(value)
}

/**
 * Parse the page's search params into validated feed filters. Invalid values
 * are DROPPED, not forwarded: the server 400s an unknown chain_id, category or
 * country rather than returning an empty page, and a crawler following a
 * mangled link must get the unfiltered feed, not an error.
 *
 * `enabledChainIds` is the RUNNING deployment's registry (listEnabledChains) —
 * validating against the static manifest instead would forward provisioned-
 * looking ids the server still rejects.
 */
export function parseGigFeedFilters(
  params: RawSearchParams,
  enabledChainIds: ReadonlySet<string>,
): GigFeedFilters {
  const category = first(params.category)
  const country = first(params.country)
  const chainId = first(params.chain_id)
  const city = first(params.city)?.trim()
  const q = first(params.q)?.trim()
  const cursor = first(params.cursor)?.trim()
  const sort = first(params.sort)
  return {
    category: category !== undefined && (GIG_CATEGORIES as readonly string[]).includes(category)
      ? (category as GigCategory)
      : null,
    country: country !== undefined && country in LOCATIONS ? country : null,
    city: city !== undefined && city !== '' ? city : null,
    chain_id: chainId !== undefined && enabledChainIds.has(chainId) ? chainId : null,
    remote: first(params.remote) === 'true',
    cross_border: first(params.cross_border) === 'true',
    q: q !== undefined && q !== '' ? q : null,
    sort: isSort(sort) ? sort : 'created_at',
    cursor: cursor !== undefined && cursor !== '' ? cursor : null,
    offset: parseOffset(first(params.offset)),
  }
}

/**
 * A page offset is a non-negative whole number of rows. Anything else — a
 * negative, a fraction, junk — is page one, because the server clamps it there
 * anyway and a link that silently lands somewhere else is worse than a link
 * that lands at the start.
 */
function parseOffset(value: string | undefined): number {
  if (value === undefined) return 0
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0
  return parsed
}

/**
 * Whether this view can be paged by keyset cursor. The server only mints a
 * `next_cursor` for the plain recency feed — it 400s a cursor sent alongside
 * `sort` or `q`, and omits the field entirely from those responses — so a
 * searched or sorted view has to page by OFFSET instead.
 *
 * Stated here rather than inferred from a missing `next_cursor` at the call
 * site: "no cursor in the response" also means "last page", and conflating
 * the two is how the searched feed ended up with no way past row twenty.
 */
export function usesCursorPaging(filters: GigFeedFilters): boolean {
  return filters.q === null && filters.sort === 'created_at'
}

/**
 * The NARROWING half of the filters — everything that changes which gigs
 * match, and nothing about which page of them or in what order. This is the
 * whole facets query, and the head of the list query, so the two surfaces
 * cannot disagree about what the reader is looking at.
 *
 * Key order is load-bearing: `toGigListQuery` spreads this first, and the
 * serialisation of that object is the React `cache()` key (see lib/gigs/data).
 */
export function toGigFacetsQuery(filters: GigFeedFilters): GigFacetsQuery {
  return {
    category: filters.category ?? undefined,
    country: filters.country ?? undefined,
    city: filters.city ?? undefined,
    chain_id: filters.chain_id ?? undefined,
    remote: filters.remote ? true : undefined,
    cross_border: filters.cross_border ? true : undefined,
    q: filters.q ?? undefined,
  }
}

/** The validated filters as the API's query shape. */
export function toGigListQuery(filters: GigFeedFilters): GigListQuery {
  const cursorPaged = usesCursorPaging(filters)
  return {
    ...toGigFacetsQuery(filters),
    // Recency is the server's default ordering; sending it explicitly would
    // opt this view OUT of cursor paging for no gain.
    sort: filters.sort === 'created_at' ? undefined : filters.sort,
    // The two paging modes are mutually exclusive on the wire — sending both
    // is the 400 `usesCursorPaging` exists to prevent.
    cursor: cursorPaged ? filters.cursor ?? undefined : undefined,
    offset: cursorPaged ? undefined : filters.offset,
    limit: GIGS_PAGE_SIZE,
  }
}

/** True when any filter narrows the feed — drives the "clear all" affordance. */
export function hasActiveFilters(filters: GigFeedFilters): boolean {
  return (
    filters.category !== null ||
    filters.country !== null ||
    filters.city !== null ||
    filters.chain_id !== null ||
    filters.remote ||
    filters.cross_border ||
    filters.q !== null ||
    filters.sort !== 'created_at'
  )
}

/**
 * Build a root-feed href with the given changes applied. `null` clears a key.
 *
 * Both position keys are dropped on every change unless passed explicitly:
 * page four of one filtering is not page four of another, and carrying a
 * keyset cursor across a filter change would page from a row that no longer
 * belongs to the query.
 */
export function gigsHref(
  filters: GigFeedFilters,
  changes: Partial<Record<GigFeedParam, string | null>> = {},
): string {
  const next = new URLSearchParams()
  const merged: Record<GigFeedParam, string | null> = {
    category: filters.category,
    country: filters.country,
    city: filters.city,
    chain_id: filters.chain_id,
    remote: filters.remote ? 'true' : null,
    cross_border: filters.cross_border ? 'true' : null,
    q: filters.q,
    // Default ordering stays out of the URL so the canonical feed has one
    // address, not two that render identically.
    sort: filters.sort === 'created_at' ? null : filters.sort,
    cursor: null,
    offset: null,
    ...changes,
  }
  for (const [key, value] of Object.entries(merged)) {
    if (value !== null && value !== undefined && value !== '') next.set(key, value)
  }
  const qs = next.toString()
  return qs === '' ? '/' : `/?${qs}`
}
