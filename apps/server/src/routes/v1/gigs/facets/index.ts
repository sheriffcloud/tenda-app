/**
 * GET /v1/gigs/facets — the counts beside the feed rail's cells, in ONE
 * request. Public, exactly as public as the feed itself.
 *
 * WHAT EACH NUMBER MEANS. A cell's count is how many gigs the reader would get
 * if they CLICKED it: the current filters with that cell's own key replaced.
 * The rail's hrefs swap exactly one key and carry the rest (`gigsHref`), so
 * counting the same way is what makes the number match the page it leads to.
 * Counting with every filter applied would instead answer "how many of what
 * you are already looking at", and every cell the reader has not picked would
 * read 0 — a rail claiming there is nothing anywhere else.
 *
 * WHY FOUR QUERIES AND NOT ONE. Each facet needs a DIFFERENT where-clause (its
 * own key lifted), so this is not one GROUP BY, and hand-writing a UNION of
 * four would mean hand-writing the feed's conditions in SQL — the one thing
 * this endpoint exists not to do. Four Drizzle queries built from the SHARED
 * builders run concurrently within a single request, which is what the rail
 * needed: the cost being avoided is ten HTTP round trips from a crawlable
 * page, not four indexed counts on one connection.
 */
import type { FastifyPluginAsync } from 'fastify'
import { and, eq, sql, type SQL } from 'drizzle-orm'
import { escrows, gig_details } from '@tenda/shared/db/schema'
import { GIG_CATEGORIES, LOCATIONS, ErrorCode, isCountryCode } from '@tenda/shared'
import type { ApiError, GigFacets, GigListQuery, GigsContract } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { assertKnownCountry, queryConditions } from '../list-filters'
import { publicGigConditions } from '../public-feed'

type FacetsRoute = GigsContract['facets']

/** Both grouped counts join the same way; the feed's own query joins on this. */
const GIG_JOIN = eq(gig_details.escrow_id, escrows.id)
const COUNT = sql<number>`count(*)::int`

/**
 * Served markets, resolved once — a module constant, not per-request work.
 * Narrowed by the shared type guard rather than cast: `Object.keys` answers
 * `string[]`, and the tally has to be keyed by the real union.
 */
const MARKET_CODES = Object.keys(LOCATIONS).filter(isCountryCode)

/**
 * Grouped rows → a map covering the WHOLE vocabulary.
 *
 * The rail draws a cell per category and per market regardless of what
 * matched, so a key absent from the GROUP BY has to arrive as 0: a blank where
 * the honest answer is "none" is the same defect as a wrong number. Keys
 * outside the vocabulary are dropped rather than passed through — a remote gig
 * persists no country and lands in a null bucket that belongs to no cell.
 */
function tally<TKey extends string>(
  vocabulary: readonly TKey[],
  rows: readonly { key: string | null; count: number }[],
): Record<TKey, number> {
  const counts = Object.fromEntries(vocabulary.map((key) => [key, 0])) as Record<TKey, number>
  const known = new Set<string>(vocabulary)
  const isKnown = (key: string): key is TKey => known.has(key)
  for (const row of rows) {
    if (row.key !== null && isKnown(row.key)) counts[row.key] = row.count
  }
  return counts
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    // The FULL feed query, deliberately wider than the contract's
    // `GigFacetsQuery`: the contract says what a client should send, this says
    // what one might actually send, and `mine`/`status` have to be readable
    // here in order to be refused rather than silently ignored.
    Querystring: GigListQuery
    Reply: FacetsRoute['response'] | ApiError
  }>('/', async (request) => {
    const query = request.query

    // Facets describe the anonymous feed and nothing else. Returning public
    // counts to `?mine=created` would look like an answer to the question the
    // caller actually asked, which is worse than refusing it.
    if (query.mine !== undefined || query.status !== undefined) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'facets describe the public feed; mine and status are not supported',
      )
    }

    assertKnownCountry(query.country)
    // Validate ONCE against the caller's unmodified query, so this route
    // refuses exactly what the feed refuses, with the same message and in the
    // same order. Each per-facet rebuild below lifts one key, and a lifted key
    // is no longer checked — validating only through those would let
    // `?category=plumbing` pass whenever the category facet was the one
    // asking. The conditions themselves are still rebuilt per facet.
    queryConditions(query, fastify.chains)

    const now = new Date()
    const base = publicGigConditions(now)

    /** The feed's conditions with ONE filter lifted — what a click replaces. */
    const withoutKey = (key: keyof GigListQuery, extra: SQL[] = []): SQL => {
      const lifted: GigListQuery = { ...query, [key]: undefined }
      return and(...base, ...queryConditions(lifted, fastify.chains), ...extra) as SQL
    }

    const [categories, countries, remote, crossBorder] = await Promise.all([
      fastify.db
        .select({ key: gig_details.category, count: COUNT })
        .from(escrows)
        .innerJoin(gig_details, GIG_JOIN)
        .where(withoutKey('category'))
        .groupBy(gig_details.category),
      fastify.db
        .select({ key: gig_details.country, count: COUNT })
        .from(escrows)
        .innerJoin(gig_details, GIG_JOIN)
        .where(withoutKey('country'))
        .groupBy(gig_details.country),
      fastify.db
        .select({ count: COUNT })
        .from(escrows)
        .innerJoin(gig_details, GIG_JOIN)
        .where(withoutKey('remote', [eq(gig_details.remote, true)])),
      fastify.db
        .select({ count: COUNT })
        .from(escrows)
        .innerJoin(gig_details, GIG_JOIN)
        .where(withoutKey('cross_border', [eq(gig_details.cross_border, true)])),
    ])

    const facets: GigFacets = {
      category: tally(GIG_CATEGORIES, categories),
      country: tally(MARKET_CODES, countries),
      // count(*) with no GROUP BY always returns exactly one row, empty table
      // included — the same assumption the feed's `total` already makes.
      remote: remote[0].count,
      cross_border: crossBorder[0].count,
    }
    return facets
  })
}

export default route
