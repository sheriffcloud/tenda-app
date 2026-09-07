import { FastifyPluginAsync } from 'fastify'
import { and, eq, sql } from 'drizzle-orm'
import { notifications } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { isUuidLike } from '@server/lib/uuid'
import type { NotificationsContract, ApiError } from '@tenda/shared'

type MarkReadRoute = NotificationsContract['markRead']

const markRead: FastifyPluginAsync = async (fastify) => {
  // POST /v1/notifications/:id/read — mark one notification read (owner only).
  fastify.post<{
    Params: MarkReadRoute['params']
    Reply: MarkReadRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const { id } = request.params
    // A non-UUID id would hit the uuid column and 500 (invalid input syntax);
    // treat it as not-found, matching loadEscrowOr404's guard.
    if (!isUuidLike(id)) throw new AppError(404, ErrorCode.NOT_FOUND, 'Notification not found')
    // COALESCE keeps an existing read_at (idempotent re-read); the user_id
    // predicate scopes to the owner, so another user's / a missing id updates
    // zero rows → 404 (leaks nothing about existence).
    const [row] = await fastify.db
      .update(notifications)
      .set({ read_at: sql`coalesce(${notifications.read_at}, now())` })
      .where(and(eq(notifications.id, id), eq(notifications.user_id, request.user.id)))
      .returning({ id: notifications.id })

    if (row === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'Notification not found')
    return { ok: true }
  })
}

export default markRead
