/**
 * GET /v1/auth/me, return the authenticated user's row.
 *
 * Preserved from the legacy auth surface; reads from v2 `users`. Wallets
 * are NOT included in the response, clients call /v1/users/:id/wallets
 * for those (added at #27 when the user routes consolidate).
 */

import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { users } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const [user] = await fastify.db
      .select()
      .from(users)
      .where(eq(users.id, request.user.id))
      .limit(1)
    if (user === undefined) {
      throw new AppError(404, ErrorCode.USER_NOT_FOUND, 'user not found')
    }
    return user
  })
}

export default route
