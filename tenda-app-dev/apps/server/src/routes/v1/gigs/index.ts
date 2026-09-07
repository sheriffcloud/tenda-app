/**
 * Gig surface (cutover §3 rewrite): listings + create-detail only.
 *   GET  /, the public feed over escrows ⨝ gig_details ⨝ users.
 *   POST /, attach gig_details to the caller's DRAFT escrow (the
 *            chain-agnostic core is created by POST /v1/escrows first;
 *            this satellite carries the human-facing listing fields and
 *            runs the Stage-6 moderation gate).
 * Transitions live under /v1/escrows/:id/*.
 */
import { FastifyPluginAsync } from 'fastify'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { isEscrowCounterpartySide } from '@server/lib/escrow-party'
import { eq, and, inArray, or, sql, lt, desc, type SQL } from 'drizzle-orm'
import { escrows, gig_details, users } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import type { GigsContract, ApiError } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { GIG_SUMMARY_COLS, toGigSummary } from '@server/lib/gig-read'
import { loadEscrowOr404 } from '@server/lib/escrow-routes'
import { attachGigDetails } from '@server/features/gigs/attachGigDetails'
import {
  assertKnownCountry,
  listOrderBy,
  parseStatusFilter,
  queryConditions,
} from './list-filters'
import { decodeGigFeedCursor, encodeGigFeedCursor } from './gig-feed-cursor'
import { publicGigConditions } from './public-feed'

type ListRoute = GigsContract['list']
type CreateRoute = GigsContract['create']

const gigsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/gigs, list open gigs with filters
  fastify.get<{
    Querystring: ListRoute['query']
    Reply: ListRoute['response'] | ApiError
  }>('/', async (request, reply) => {
    const { mine, status, limit = 20, offset = 0, cursor } = request.query

    // BEFORE the `mine` branch below, which authenticates. Position is
    // behaviour, not style: `?mine=created&country=BOGUS` with no token
    // answers 400 (the country) and not 401, because that is what this route
    // has always answered. Moving the check inside `queryConditions` — where
    // it reads more naturally — silently flipped it to 401, and every existing
    // gigs test still passed. Pinned by gigs-listing.test.ts.
    assertKnownCountry(request.query.country)

    const safeLimit = clampLimit(Number(limit))
    const safeOffset = clampOffset(Number(offset))

    const now = new Date()
    // Each branch states its own full condition set — `kind` included — so the
    // public one can be the SHARED builder rather than a partial list this
    // handler completes. /v1/gigs/facets pushes the identical array.
    const conditions: SQL[] = []
    let cursorCondition: SQL | null = null

    if (mine !== undefined) {
      conditions.push(eq(escrows.kind, 'gig'))
      if (cursor !== undefined) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'cursor is only supported by the public feed')
      }
      // Own listings (my-gigs surface): every status incl. drafts, auth
      // required; identity comes from the JWT, never a param.
      if (mine !== 'created' && mine !== 'working') {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, "mine must be 'created' or 'working'")
      }
      // Full authenticate (not bare jwtVerify) so suspended accounts are
      // rejected here exactly like every other authenticated surface.
      await fastify.authenticate(request, reply)
      if (reply.sent) return reply
      const userId = request.user.id
      conditions.push(
        mine === 'created'
          ? eq(escrows.creator_id, userId)
          : isEscrowCounterpartySide(userId),
      )

      // Status buckets over the caller's OWN rows. Paired with `limit=1` this
      // is how a caller reads a status-scoped COUNT off `total` instead of
      // pulling a capped page and counting it client-side (MB2).
      const statuses = parseStatusFilter(status)
      if (statuses !== null) conditions.push(inArray(escrows.status, statuses))
    } else {
      // A status filter on the PUBLIC feed would be a probe for rows that are
      // deliberately not public (drafts, cancelled, disputed), so it is
      // rejected outright rather than silently ANDed with status='open' —
      // which would return an empty page and read as "no such gigs".
      if (status !== undefined) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'status filter requires mine=created or mine=working',
        )
      }
      // What "public" means lives in ./public-feed, shared verbatim with the
      // facets route so the rail's counts and this list can never disagree
      // about which gigs exist.
      conditions.push(...publicGigConditions(now))
    }

    // Every filter that reads only the querystring — attributes, chain,
    // search, amount window, proximity — plus their 400s, IN THE ORDER THEY
    // REFUSE IN. That order is behaviour: these all answer 400
    // VALIDATION_ERROR and differ only in the message, so it decides what the
    // user is told. It is owned by ./list-filters and pinned there.
    conditions.push(...queryConditions(request.query, fastify.chains))

    // Decode only after the ordinary filters above have validated. Their
    // refusal order is part of this endpoint's established error contract.
    if (cursor !== undefined) {
      if (request.query.sort !== undefined || (request.query.q?.trim() ?? '') !== '') {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'cursor requires recency ordering')
      }
      const decoded = decodeGigFeedCursor(cursor)
      cursorCondition = or(
        lt(escrows.created_at, decoded.created_at),
        and(eq(escrows.created_at, decoded.created_at), lt(escrows.id, decoded.escrow_id)),
      ) as SQL
    }

    const countWhere = and(...conditions)
    const where = cursorCondition === null ? countWhere : and(countWhere, cursorCondition)

    const hasSearch = (request.query.q?.trim() ?? '') !== ''
    const usesRecencyCursor = mine === undefined && request.query.sort === undefined && !hasSearch
    const usesRecencyOrdering = !hasSearch && (
      request.query.sort === undefined || request.query.sort === 'created_at'
    )
    // Both arms are TOTAL orderings ending in the primary key — the keyset
    // cursor compares (created_at, id) and offset paging is only stable over
    // a total order. `listOrderBy` owns the tiebreaker for the rest.
    const orderBy = cursor !== undefined || usesRecencyOrdering
      ? [desc(escrows.created_at), desc(escrows.id)]
      : listOrderBy(request.query)

    const [data, countResult] = await Promise.all([
      fastify.db
        .select(GIG_SUMMARY_COLS)
        .from(escrows)
        .innerJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
        .innerJoin(users, eq(users.id, escrows.creator_id))
        .where(where)
        .limit(safeLimit)
        .offset(cursor === undefined ? safeOffset : 0)
        .orderBy(...orderBy),
      fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(escrows)
        .innerJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
        .where(countWhere),
    ])

    return {
      data: data.map(toGigSummary),
      total: countResult[0].count,
      limit: safeLimit,
      offset: cursor === undefined ? safeOffset : 0,
      ...(usesRecencyCursor
        ? {
            next_cursor:
              data.length === safeLimit && data[data.length - 1] !== undefined
                ? encodeGigFeedCursor({
                    created_at: data[data.length - 1].created_at,
                    escrow_id: data[data.length - 1].escrow_id,
                  })
                : null,
          }
        : {}),
    }
  })

  // POST /v1/gigs, attach listing details to the caller's draft escrow —
  // see features/gigs/attachGigDetails for the guards and the moderation gate.
  fastify.post<{
    Body: CreateRoute['body']
    Reply: CreateRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body ?? {}
    if (typeof body.escrow_id !== 'string' || body.escrow_id === '') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'escrow_id is required')
    }

    const escrow = await loadEscrowOr404(fastify.db, body.escrow_id)
    // Guards, validation, moderation and the upsert live in the feature —
    // shared with the agent one-shot (POST /v1/agent/tasks).
    const row = await attachGigDetails(fastify, { escrow, user_id: request.user.id, body })
    return reply.code(201).send(row)
  })
}

export default gigsRoutes
