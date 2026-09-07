import { FastifyPluginAsync } from 'fastify'
import { uuidParamGuard } from '@server/lib/guards'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { eq, sql } from 'drizzle-orm'
import { reviews } from '@tenda/shared/db/schema'
import { ensureUserExists } from '@server/lib/users'
import { ErrorCode } from '@tenda/shared'
import type { UsersContract, ApiError } from '@tenda/shared'

type ReviewsRoute = UsersContract['reviews']

const userReviews: FastifyPluginAsync = async (fastify) => {
  // Malformed `:id` reaches postgres as a uuid comparison and throws;
  // answer it the way an unknown id is already answered.
  fastify.addHook('preHandler', uuidParamGuard('User not found', { code: ErrorCode.USER_NOT_FOUND }))

  // GET /v1/users/:id/reviews, paginated list of reviews for a user
  fastify.get<{
    Params: ReviewsRoute['params']
    Querystring: ReviewsRoute['query']
    Reply: ReviewsRoute['response'] | ApiError
  }>('/', async (request, _reply) => {
    const { id } = request.params
    const { limit = 20, offset = 0 } = request.query

    const safeLimit  = clampLimit(Number(limit))
    const safeOffset = clampOffset(Number(offset))

    await ensureUserExists(fastify.db, id)

    const where = eq(reviews.reviewee_id, id)

    const [data, countResult] = await Promise.all([
      fastify.db
        .select()
        .from(reviews)
        .where(where)
        .limit(safeLimit)
        .offset(safeOffset)
        .orderBy(reviews.created_at),
      fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviews)
        .where(where),
    ])

    return {
      data,
      total:  countResult[0].count,
      limit:  safeLimit,
      offset: safeOffset,
    }
  })
}

export default userReviews
