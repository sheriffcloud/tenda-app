import { FastifyPluginAsync } from 'fastify'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { and, desc, isNull, or, gt, eq, sql } from 'drizzle-orm'
import { announcements } from '@tenda/shared/db/schema'
import type { ApiError } from '@tenda/shared'

const announcementsRoute: FastifyPluginAsync = async (fastify) => {
  // GET /v1/announcements, active, non-expired announcements for the mobile app
  // Public endpoint, no authentication required.
  // Ordered by priority DESC so urgent notices appear first.
  fastify.get<{
    Querystring: { limit?: number; offset?: number }
    Reply: { data: unknown[]; total: number; limit: number; offset: number } | ApiError
  }>('/', async (request) => {
    const { limit = 20, offset = 0 } = request.query
    const safeLimit  = clampLimit(Number(limit))
    const safeOffset = clampOffset(Number(offset))

    const now = new Date()
    // Unauthenticated surface: only everyone-notices (NULL target). Role/country/
    // city-targeted broadcasts are private to their audience — they surface via
    // the authenticated feed (GET /v1/notifications), never here.
    const where = and(
      eq(announcements.is_active, true),
      isNull(announcements.target),
      or(isNull(announcements.expires_at), gt(announcements.expires_at, now)),
    )

    const [data, countResult] = await Promise.all([
      fastify.db
        .select({
          id:           announcements.id,
          title:        announcements.title,
          body:         announcements.body,
          priority:     announcements.priority,
          published_at: announcements.published_at,
          expires_at:   announcements.expires_at,
        })
        .from(announcements)
        .where(where)
        .orderBy(desc(announcements.priority), desc(announcements.published_at))
        .limit(safeLimit)
        .offset(safeOffset),
      fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(announcements)
        .where(where),
    ])

    return { data, total: countResult[0].count, limit: safeLimit, offset: safeOffset }
  })
}

export default announcementsRoute
