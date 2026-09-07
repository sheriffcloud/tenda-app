/**
 * GET /v1/gigs — turning the querystring into SQL.
 *
 * NOT a route. This directory has an index.ts, so @fastify/autoload loads only
 * that file and never registers siblings; see the note at the top of
 * routes/v1/admin/index.ts, which documents the same semantics for the
 * directory that relies on them.
 *
 * Split out because the list handler was almost entirely this: ~120 lines of
 * filter parsing wrapped around two queries. Every function here maps the
 * QUERYSTRING to SQL and nothing else, which makes them readable in isolation
 * and reachable from a test without a request — `queryConditions` takes the
 * chain registry as a parameter (a structural type, see lib/chain-filter)
 * precisely so that stays true. What is NOT here is anything needing the
 * REQUEST: the `mine` branch authenticates and reads `request.user`, so it
 * stays in the handler where the auth lives.
 *
 * Validation throws rather than returning an error value, matching every other
 * route helper — a bad filter is a 400 and there is nothing sensible to do
 * with a partially-parsed one. Because they all throw the SAME 400 and differ
 * only in the message, the ORDER they run in is behaviour; see the note on
 * `queryConditions`.
 */

import { eq, gte, lte, asc, desc, sql, type SQL } from 'drizzle-orm'
import { escrows, escrowStatusEnum, gig_details } from '@tenda/shared/db/schema'
import {
  isValidLatitude,
  isValidLongitude,
  GIG_CATEGORIES,
  LOCATIONS,
  ErrorCode,
} from '@tenda/shared'
import type { GigsContract, GigCategory, EscrowStatus } from '@tenda/shared'
import { isAmountRaw } from '@server/chains/types'
import { AppError } from '@server/lib/errors'
import { gigSearchCondition, gigSearchRank } from '@server/lib/gig-search'
import { chainFilterCondition, type ChainFilterRegistry } from '@server/lib/chain-filter'

type ListQuery = GigsContract['list']['query']

/**
 * Parse the own-listings `status` filter. Typed as an array, but a
 * querystring arrives as text — the client serialises the array to CSV — so
 * both shapes are accepted. Values are checked against the DB enum, which
 * makes the enum the single source of truth (a new status needs no edit
 * here) and keeps an unknown value a clean 400 rather than a Postgres
 * invalid-input-for-enum error surfacing as a 500.
 */
export function parseStatusFilter(status: EscrowStatus[] | undefined): EscrowStatus[] | null {
  if (status === undefined) return null
  const raw = Array.isArray(status) ? status : String(status).split(',')
  const values = raw.map((s) => String(s).trim()).filter((s) => s !== '')
  if (values.length === 0) return null // `?status=` is "no filter", not an error
  const allowed: readonly string[] = escrowStatusEnum.enumValues
  for (const value of values) {
    if (!allowed.includes(value)) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `status must be one of: ${allowed.join(', ')}`,
      )
    }
  }
  return values as EscrowStatus[]
}

/** Country is validated up front — it is the one filter with a closed vocabulary. */
export function assertKnownCountry(country: string | undefined): void {
  if (country && !(country in LOCATIONS)) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `country must be one of: ${Object.keys(LOCATIONS).join(', ')}`,
    )
  }
}

/**
 * The gig_details attribute filters. `String(x) === 'true'` rather than a
 * truthiness test because these arrive as querystring TEXT: `remote=false`
 * is the string 'false', which is truthy.
 */
export function attributeConditions(query: ListQuery): SQL[] {
  const { country, remote, cross_border, city, category } = query
  const conditions: SQL[] = []
  if (country) conditions.push(eq(gig_details.country, country))
  if (String(remote) === 'true') conditions.push(eq(gig_details.remote, true))
  if (String(remote) === 'false') conditions.push(eq(gig_details.remote, false))
  if (String(cross_border) === 'true') conditions.push(eq(gig_details.cross_border, true))
  if (String(cross_border) === 'false') conditions.push(eq(gig_details.cross_border, false))
  if (city) conditions.push(eq(gig_details.city, city))
  if (category) {
    if (!GIG_CATEGORIES.includes(category as GigCategory)) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `category must be one of: ${GIG_CATEGORIES.join(', ')}`,
      )
    }
    conditions.push(eq(gig_details.category, category))
  }
  return conditions
}

/** Full-text search over title + description (S5.3), when `q` is non-blank. */
export function searchCondition(q: string | undefined): SQL | null {
  return q !== undefined && q.trim() !== '' ? gigSearchCondition(q) : null
}

/**
 * The amount window. Both bounds are decimal integer STRINGS (amount_raw is
 * numeric(78,0)), so the ordering check compares BigInts — a lexicographic
 * string compare would call '9' greater than '10'.
 */
export function amountConditions(query: ListQuery): SQL[] {
  const { min_amount_raw, max_amount_raw } = query
  if (min_amount_raw !== undefined && !isAmountRaw(min_amount_raw)) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'min_amount_raw must be a decimal integer string')
  }
  if (max_amount_raw !== undefined && !isAmountRaw(max_amount_raw)) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'max_amount_raw must be a decimal integer string')
  }
  if (min_amount_raw !== undefined && max_amount_raw !== undefined && BigInt(min_amount_raw) > BigInt(max_amount_raw)) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'min_amount_raw must be ≤ max_amount_raw')
  }
  const conditions: SQL[] = []
  if (min_amount_raw !== undefined) conditions.push(gte(escrows.amount_raw, min_amount_raw))
  if (max_amount_raw !== undefined) conditions.push(lte(escrows.amount_raw, max_amount_raw))
  return conditions
}

/**
 * Haversine proximity filter. All three params must arrive together — a
 * partial triple is a caller bug, and silently ignoring it would return the
 * unfiltered feed as though the radius had applied.
 */
export function proximityCondition(query: ListQuery): SQL | null {
  const { lat, lng, radius_km } = query
  if (lat === undefined && lng === undefined && radius_km === undefined) return null

  const latN = Number(lat)
  const lngN = Number(lng)
  const rN = Number(radius_km)
  if (
    lat === undefined ||
    lng === undefined ||
    radius_km === undefined ||
    !isValidLatitude(latN) ||
    !isValidLongitude(lngN) ||
    isNaN(rN) ||
    rN <= 0 ||
    rN > 20_000
  ) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'lat (−90–90), lng (−180–180), and radius_km (0–20000) must all be provided and valid',
    )
  }
  // @todo Migrate to PostGIS ST_DWithin when query volume grows
  return sql`${gig_details.latitude} IS NOT NULL AND ${gig_details.longitude} IS NOT NULL AND
          (6371 * acos(
            cos(radians(${latN})) * cos(radians(${gig_details.latitude})) *
            cos(radians(${gig_details.longitude}) - radians(${lngN})) +
            sin(radians(${latN})) * sin(radians(${gig_details.latitude}))
          )) <= ${rN}`
}

/**
 * Ordering. An explicit `sort` wins; otherwise a search orders by RELEVANCE
 * and everything else by recency. Relevance is only meaningful when there is
 * a query to rank against, which is why it is not a `sort` value.
 */
export function listOrderBy(query: ListQuery): SQL {
  const { sort, q } = query
  if (sort === 'amount_asc') return asc(escrows.amount_raw)
  if (sort === 'amount_desc') return desc(escrows.amount_raw)
  if (q !== undefined && q.trim() !== '') return desc(gigSearchRank(q))
  return desc(escrows.created_at)
}

/**
 * Every non-request-scoped filter, in one call. `and()` is applied by the
 * caller.
 *
 * THE SEQUENCE BELOW IS BEHAVIOUR, NOT ARRANGEMENT. Each of these filters
 * refuses with the same 400 + VALIDATION_ERROR and differs only in its
 * MESSAGE, so whichever runs first is the one the user is told about — and
 * that is invisible to any assertion on the status code. Two separate
 * re-orderings slipped through the #48 split for exactly that reason: first
 * `chain_id` was hoisted above `category`, then the correction pushed it below
 * `amount` and `proximity` as well. The order is
 *
 *     attributes (category) → chain_id → search → amount → proximity
 *
 * which is the order the handler ran them in before the split. It lives here,
 * in one function, so there is a single place to get it right and a single
 * place to test — which is why the chain registry is a PARAMETER rather than
 * the guard staying behind in the handler.
 *
 * Does NOT check the country, deliberately: that one has to run before the
 * handler authenticates, so the handler calls `assertKnownCountry` itself. See
 * the note at that call site.
 */
export function queryConditions(query: ListQuery, chains: ChainFilterRegistry): SQL[] {
  const conditions = [...attributeConditions(query)]
  const chain = chainFilterCondition(chains, query.chain_id)
  if (chain !== null) conditions.push(chain)
  const search = searchCondition(query.q)
  if (search !== null) conditions.push(search)
  conditions.push(...amountConditions(query))
  const proximity = proximityCondition(query)
  if (proximity !== null) conditions.push(proximity)
  return conditions
}
