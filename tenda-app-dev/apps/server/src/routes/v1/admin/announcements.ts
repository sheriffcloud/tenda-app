import { FastifyPluginAsync } from 'fastify'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { eq, desc, sql } from 'drizzle-orm'
import { announcements } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { requirePermission, uuidParamGuard } from '@server/lib/guards'
import { AppError, requireBody } from '@server/lib/errors'
import { appEvents } from '@server/lib/events'
import { createAnnouncement, normalizeTarget } from '@server/lib/announcements'
import type { ApiError } from '@tenda/shared'


const adminAnnouncements: FastifyPluginAsync = async (fastify) => {
  // Malformed id reaches postgres as a uuid comparison and throws; answer
  // it the way an unknown id already is.
  fastify.addHook('preHandler', uuidParamGuard('Announcement not found'))

  // GET /v1/admin/announcements, all announcements (active and inactive)
  fastify.get<{
    Querystring: { limit?: number; offset?: number; active?: string }
    Reply: { data: unknown[]; total: number; limit: number; offset: number } | ApiError
  }>('/', {
    preHandler: [requirePermission('announcements.read')],
  }, async (request) => {
    const { limit = 20, offset = 0, active } = request.query
    const safeLimit  = clampLimit(Number(limit))
    const safeOffset = clampOffset(Number(offset))

    const where = active === 'true'  ? eq(announcements.is_active, true)
                : active === 'false' ? eq(announcements.is_active, false)
                : undefined

    const [data, countResult] = await Promise.all([
      fastify.db
        .select()
        .from(announcements)
        .where(where)
        .orderBy(desc(announcements.priority), desc(announcements.created_at))
        .limit(safeLimit)
        .offset(safeOffset),
      fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(announcements)
        .where(where),
    ])

    return { data, total: countResult[0].count, limit: safeLimit, offset: safeOffset }
  })

  // GET /v1/admin/announcements/:id
  fastify.get<{
    Params: { id: string }
    Reply: unknown | ApiError
  }>('/:id', {
    preHandler: [requirePermission('announcements.read')],
  }, async (request) => {
    const [row] = await fastify.db
      .select()
      .from(announcements)
      .where(eq(announcements.id, request.params.id))
      .limit(1)
    if (!row) throw new AppError(404, ErrorCode.NOT_FOUND, 'Announcement not found')
    return row
  })

  // POST /v1/admin/announcements, create a persistent in-app banner (optionally
  // targeted). This does NOT push — pushing is the dedicated /admin/push/broadcast
  // route (its own `push.broadcast` permission + rate limit), which also persists
  // an announcement. Keeping push off this endpoint means `announcements.write`
  // can never become a backdoor to broadcasting.
  fastify.post<{
    Body:  {
      title: string; body: string; priority?: number; is_active?: boolean; expires_at?: string
      target?: string; target_value?: string
    }
    Reply: unknown | ApiError
  }>('/', {
    preHandler: [requirePermission('announcements.write')],
  }, async (request) => {
    const { title, body, priority = 0, is_active = true, expires_at, target, target_value } =
      requireBody(request.body)

    if (!title || title.trim().length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'title is required')
    }
    if (!body || body.trim().length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'body is required')
    }
    if (!Number.isInteger(priority) || priority < 0 || priority > 10) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'priority must be an integer between 0 and 10')
    }

    const expiresAt = expires_at ? new Date(expires_at) : null
    if (expiresAt && isNaN(expiresAt.getTime())) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'expires_at must be a valid ISO date')
    }

    const audience = normalizeTarget(target, target_value)
    const { announcement } = await createAnnouncement(fastify.db, {
      title:        title.trim(),
      body:         body.trim(),
      priority,
      is_active,
      target:       audience.target,
      target_value: audience.target_value,
      expires_at:   expiresAt,
      created_by:   request.user.id,
    })

    appEvents.emit('admin.create_announcement', {
      adminId:        request.user.id,
      adminRole:      request.user.role,
      announcementId: announcement.id,
      title:          announcement.title,
      priority:       announcement.priority,
    })

    return announcement
  })

  // PATCH /v1/admin/announcements/:id, update
  fastify.patch<{
    Params: { id: string }
    Body:  { title?: string; body?: string; priority?: number; is_active?: boolean; expires_at?: string | null }
    Reply: unknown | ApiError
  }>('/:id', {
    preHandler: [requirePermission('announcements.write')],
  }, async (request) => {
    const { title, body, priority, is_active, expires_at } = requireBody(request.body)

    if (title !== undefined && title.trim().length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'title cannot be empty')
    }
    if (body !== undefined && body.trim().length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'body cannot be empty')
    }
    if (priority !== undefined && (!Number.isInteger(priority) || priority < 0 || priority > 10)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'priority must be an integer between 0 and 10')
    }

    const expiresAt = expires_at === null ? null
                    : expires_at !== undefined ? new Date(expires_at)
                    : undefined
    if (expiresAt !== undefined && expiresAt !== null && isNaN(expiresAt.getTime())) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'expires_at must be a valid ISO date or null')
    }

    // Fetch current row to determine whether to set published_at
    const [current] = await fastify.db
      .select({ id: announcements.id, title: announcements.title, published_at: announcements.published_at })
      .from(announcements)
      .where(eq(announcements.id, request.params.id))
      .limit(1)
    if (!current) throw new AppError(404, ErrorCode.NOT_FOUND, 'Announcement not found')

    const updates: Record<string, unknown> = { updated_at: new Date() }
    if (title      !== undefined) updates.title      = title.trim()
    if (body       !== undefined) updates.body        = body.trim()
    if (priority   !== undefined) updates.priority   = priority
    if (is_active  !== undefined) updates.is_active  = is_active
    if (expiresAt  !== undefined) updates.expires_at = expiresAt
    // Set published_at the first time is_active is set to true
    if (is_active && !current.published_at) updates.published_at = new Date()

    const [updated] = await fastify.db
      .update(announcements)
      .set(updates)
      .where(eq(announcements.id, request.params.id))
      .returning()

    appEvents.emit('admin.update_announcement', {
      adminId:        request.user.id,
      adminRole:      request.user.role,
      announcementId: updated!.id,
      title:          updated!.title,
    })

    return updated
  })

  // DELETE /v1/admin/announcements/:id
  fastify.delete<{
    Params: { id: string }
    Reply:  { id: string } | ApiError
  }>('/:id', {
    preHandler: [requirePermission('announcements.write')],
  }, async (request) => {
    const [deleted] = await fastify.db
      .delete(announcements)
      .where(eq(announcements.id, request.params.id))
      .returning({ id: announcements.id, title: announcements.title })

    if (!deleted) throw new AppError(404, ErrorCode.NOT_FOUND, 'Announcement not found')

    appEvents.emit('admin.delete_announcement', {
      adminId:        request.user.id,
      adminRole:      request.user.role,
      announcementId: deleted.id,
      title:          deleted.title,
    })

    return { id: deleted.id }
  })
}

export default adminAnnouncements
