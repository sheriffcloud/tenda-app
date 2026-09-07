import { FastifyPluginAsync } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { device_tokens } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import type { NotificationsContract, ApiError } from '@tenda/shared'
import { AppError, requireBody } from '@server/lib/errors'

type RegisterRoute = NotificationsContract['registerToken']

const deviceToken: FastifyPluginAsync = async (fastify) => {
  // POST /v1/notifications/device-token, upsert a push token for the authenticated user.
  fastify.post<{
    Body: RegisterRoute['body']
    Reply: RegisterRoute['response'] | ApiError
  }>(
    '/',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { token, platform = 'expo' } = requireBody(request.body)
      const userId = request.user.id

      if (!token || typeof token !== 'string') throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'token is required')

      // Insert the token for this user. On conflict (same token already registered),
      // only refresh updated_at, never reassign user_id so an attacker who learns
      // another user's token cannot redirect their notifications.
      await fastify.db
        .insert(device_tokens)
        .values({ user_id: userId, token, platform })
        .onConflictDoUpdate({
          target: device_tokens.token,
          set: { updated_at: new Date() },
        })

      return reply.code(200).send({ ok: true })
    },
  )

  // DELETE /v1/notifications/device-token, remove the token (called on logout)
  fastify.delete<{
    Body: { token: string }
    Reply: { ok: boolean } | ApiError
  }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { token } = request.body ?? {}
      if (token) {
        await fastify.db
          .delete(device_tokens)
          .where(and(eq(device_tokens.token, token), eq(device_tokens.user_id, request.user.id)))
      }
      return reply.code(200).send({ ok: true })
    },
  )
}

export default deviceToken
