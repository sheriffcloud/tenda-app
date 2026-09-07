/**
 * GET /v1/users/:id/standing, public standing summary (stage-7).
 * Rolled-up signals ONLY: raw abandoned/dispute counters never leak
 * (prevents adversarial pattern-mining). Optional auth, the response is
 * identical either way.
 */

import type { FastifyPluginAsync } from 'fastify'
import { uuidParamGuard } from '@server/lib/guards'
import { eq } from 'drizzle-orm'
import { users } from '@tenda/shared/db/schema/identity'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { toPublicStanding } from '@server/features/reputation/service'
import { drizzleReputationStore } from '@server/features/reputation/store'

const route: FastifyPluginAsync = async (fastify) => {
  // Malformed `:id` reaches postgres as a uuid comparison and throws;
  // answer it the way an unknown id is already answered.
  fastify.addHook('preHandler', uuidParamGuard('user not found', { code: ErrorCode.USER_NOT_FOUND }))

  fastify.get<{ Params: { id: string } }>('/', async (request) => {
    const [user] = await fastify.db
      .select({ review_score: users.review_score, created_at: users.created_at })
      .from(users)
      .where(eq(users.id, request.params.id))
      .limit(1)
    if (user === undefined) {
      throw new AppError(404, ErrorCode.USER_NOT_FOUND, 'user not found')
    }

    const standing = await drizzleReputationStore(fastify.db).getStanding(request.params.id)
    const summary = toPublicStanding(standing, new Date())
    return {
      ...summary,
      review_score: user.review_score,
      member_since: user.created_at,
    }
  })
}

export default route
