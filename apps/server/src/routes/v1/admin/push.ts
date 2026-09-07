import { FastifyPluginAsync } from 'fastify'
import { ErrorCode, PUSH_ANNOUNCEMENT_TTL_DAYS } from '@tenda/shared'
import { requirePermission } from '@server/lib/guards'
import { AppError, requireBody } from '@server/lib/errors'
import { appEvents } from '@server/lib/events'
import { createAnnouncement, normalizeTarget } from '@server/lib/announcements'
import type { ApiError } from '@tenda/shared'

const DAY_MS = 24 * 3_600_000

const adminPush: FastifyPluginAsync = async (fastify) => {
  // POST /v1/admin/push/broadcast
  // target: 'all' | 'role' | 'country' | 'city'
  // target_value: required when target != 'all' (role name, country code, city name)
  // Rate-limited: 10 broadcasts per hour to prevent runaway campaigns.
  //
  // A broadcast persists as ONE targeted announcement (self-expiring after
  // PUSH_ANNOUNCEMENT_TTL_DAYS) so it is readable in-app afterwards, AND pushes
  // to the audience's devices. No per-user rows are written (fan-out on read).
  fastify.post<{
    Body:  { title: string; body: string; target: string; target_value?: string; data?: Record<string, unknown> }
    Reply: { attempted: number } | ApiError
  }>('/broadcast', {
    preHandler: [requirePermission('push.broadcast')],
    config:     { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request) => {
    const { title, body, target, target_value, data: pushData } = requireBody(request.body)

    if (!title || title.trim().length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'title is required')
    }
    if (!body || body.trim().length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'body is required')
    }
    if (!target || target.trim().length === 0) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'target is required')
    }
    // Shared normalizer: validates target, maps 'all' → NULL (everyone),
    // requires target_value for role/country/city.
    const audience = normalizeTarget(target, target_value)

    const { push_attempted } = await createAnnouncement(
      fastify.db,
      {
        title:        title.trim(),
        body:         body.trim(),
        priority:     0,
        is_active:    true,
        target:       audience.target,
        target_value: audience.target_value,
        expires_at:   new Date(Date.now() + PUSH_ANNOUNCEMENT_TTL_DAYS * DAY_MS),
        created_by:   request.user.id,
      },
      { push: true, log: fastify.log, ...(pushData ? { pushData } : {}) },
    )

    appEvents.emit('admin.broadcast_push', {
      adminId:        request.user.id,
      adminRole:      request.user.role,
      target,
      targetValue:    target_value,
      attemptedCount: push_attempted,
    })

    return { attempted: push_attempted }
  })
}

export default adminPush
