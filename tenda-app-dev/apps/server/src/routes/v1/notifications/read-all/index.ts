import { FastifyPluginAsync } from 'fastify'
import { and, eq, isNull } from 'drizzle-orm'
import { notifications, users } from '@tenda/shared/db/schema'
import type { NotificationsContract, ApiError } from '@tenda/shared'

type MarkAllRoute = NotificationsContract['markAllRead']

const markAllRead: FastifyPluginAsync = async (fastify) => {
  // POST /v1/notifications/read-all — mark every personal notification read AND
  // advance the announcement read cursor, so the badge clears to zero.
  fastify.post<{
    Reply: MarkAllRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const userId = request.user.id
    const now = new Date()
    // Two-table write → one transaction (repo convention).
    await fastify.db.transaction(async (tx) => {
      await tx
        .update(notifications)
        .set({ read_at: now })
        .where(and(eq(notifications.user_id, userId), isNull(notifications.read_at)))
      await tx.update(users).set({ announcements_read_at: now }).where(eq(users.id, userId))
    })
    return { ok: true }
  })
}

export default markAllRead
