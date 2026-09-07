/**
 * CO8 featured-slot curation (escrows.feature): schedule, reschedule and
 * remove rail placements. The public rail itself is GET /v1/gigs/featured;
 * every mutation here invalidates its cache.
 */
import { FastifyPluginAsync } from 'fastify'
import { desc, eq, gte } from 'drizzle-orm'
import { escrows, gig_details, featured_slots } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import type { ApiError, CreateFeaturedSlotBody, FeaturedSlotRow, UpdateFeaturedSlotBody } from '@tenda/shared'
import { requirePermission, uuidParamGuard } from '@server/lib/guards'
import { AppError } from '@server/lib/errors'
import { appEvents } from '@server/lib/events'
import { invalidateFeaturedCache } from '@server/lib/featured'

const MAX_POSITION = 100

function parseWindow(starts_at: unknown, ends_at: unknown): { starts: Date; ends: Date } {
  if (typeof starts_at !== 'string' || typeof ends_at !== 'string') {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'starts_at and ends_at are required ISO timestamps')
  }
  const starts = new Date(starts_at)
  const ends = new Date(ends_at)
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'starts_at/ends_at must be ISO timestamps')
  }
  if (ends.getTime() <= starts.getTime()) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'ends_at must be after starts_at')
  }
  return { starts, ends }
}

function assertPosition(position: number): void {
  if (!Number.isInteger(position) || position < 0 || position > MAX_POSITION) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, `position must be an integer 0–${MAX_POSITION}`)
  }
}

const adminFeatured: FastifyPluginAsync = async (fastify) => {
  // Malformed id reaches postgres as a uuid comparison and throws; answer
  // it the way an unknown id already is.
  fastify.addHook('preHandler', uuidParamGuard('Featured slot not found'))

  const rowCols = {
    id: featured_slots.id,
    escrow_id: featured_slots.escrow_id,
    starts_at: featured_slots.starts_at,
    ends_at: featured_slots.ends_at,
    position: featured_slots.position,
    created_by: featured_slots.created_by,
    created_at: featured_slots.created_at,
    title: gig_details.title,
  }

  interface SlotRow {
    id: string
    escrow_id: string
    starts_at: Date
    ends_at: Date
    position: number
    created_by: string | null
    created_at: Date
    title: string | null
  }

  const toRow = (row: SlotRow): FeaturedSlotRow => ({
    ...row,
    starts_at: row.starts_at.toISOString(),
    ends_at: row.ends_at.toISOString(),
    created_at: row.created_at.toISOString(),
  })

  // GET /v1/admin/featured, current + upcoming slots (expired drop off).
  fastify.get<{ Reply: { data: FeaturedSlotRow[] } | ApiError }>(
    '/',
    { preHandler: [requirePermission('escrows.feature')] },
    async () => {
      const rows = await fastify.db
        .select(rowCols)
        .from(featured_slots)
        .leftJoin(gig_details, eq(gig_details.escrow_id, featured_slots.escrow_id))
        .where(gte(featured_slots.ends_at, new Date()))
        .orderBy(featured_slots.position, desc(featured_slots.starts_at))
      return { data: rows.map(toRow) }
    },
  )

  // POST /v1/admin/featured, schedule a placement.
  fastify.post<{ Body: CreateFeaturedSlotBody; Reply: FeaturedSlotRow | ApiError }>(
    '/',
    { preHandler: [requirePermission('escrows.feature')] },
    async (request, reply) => {
      const { escrow_id, position = 0 } = request.body ?? {}
      if (typeof escrow_id !== 'string' || escrow_id === '') {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'escrow_id is required')
      }
      const { starts, ends } = parseWindow(request.body?.starts_at, request.body?.ends_at)
      assertPosition(position)

      // Only gigs ride the rail (it sits on the gig feed); exchange offers
      // have their own surface.
      const [escrow] = await fastify.db
        .select({ id: escrows.id, kind: escrows.kind })
        .from(escrows)
        .where(eq(escrows.id, escrow_id))
        .limit(1)
      if (escrow === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'Escrow not found')
      if (escrow.kind !== 'gig') {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'Only gig listings can be featured')
      }

      const [inserted] = await fastify.db
        .insert(featured_slots)
        .values({
          escrow_id,
          starts_at: starts,
          ends_at: ends,
          position,
          created_by: request.user.id,
        })
        .returning()
      invalidateFeaturedCache()
      appEvents.emit('admin.create_featured_slot', {
        adminId: request.user.id,
        adminRole: request.user.role,
        slotId: inserted.id,
        escrowId: escrow_id,
      })
      return reply.code(201).send(toRow({ ...inserted, title: null }))
    },
  )

  // PATCH /v1/admin/featured/:id, reschedule / reorder.
  fastify.patch<{ Params: { id: string }; Body: UpdateFeaturedSlotBody; Reply: FeaturedSlotRow | ApiError }>(
    '/:id',
    { preHandler: [requirePermission('escrows.feature')] },
    async (request) => {
      const body = request.body ?? {}
      const [existing] = await fastify.db
        .select()
        .from(featured_slots)
        .where(eq(featured_slots.id, request.params.id))
        .limit(1)
      if (existing === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'Featured slot not found')

      const { starts, ends } = parseWindow(
        body.starts_at ?? existing.starts_at.toISOString(),
        body.ends_at ?? existing.ends_at.toISOString(),
      )
      const position = body.position ?? existing.position
      assertPosition(position)

      const [updated] = await fastify.db
        .update(featured_slots)
        .set({ starts_at: starts, ends_at: ends, position })
        .where(eq(featured_slots.id, existing.id))
        .returning()
      invalidateFeaturedCache()
      return toRow({ ...updated, title: null })
    },
  )

  // DELETE /v1/admin/featured/:id, remove a placement.
  fastify.delete<{ Params: { id: string }; Reply: { deleted: true } | ApiError }>(
    '/:id',
    { preHandler: [requirePermission('escrows.feature')] },
    async (request) => {
      const deleted = await fastify.db
        .delete(featured_slots)
        .where(eq(featured_slots.id, request.params.id))
        .returning({ id: featured_slots.id, escrow_id: featured_slots.escrow_id })
      if (deleted.length === 0) throw new AppError(404, ErrorCode.NOT_FOUND, 'Featured slot not found')
      invalidateFeaturedCache()
      appEvents.emit('admin.delete_featured_slot', {
        adminId: request.user.id,
        adminRole: request.user.role,
        slotId: deleted[0].id,
        escrowId: deleted[0].escrow_id,
      })
      return { deleted: true }
    },
  )
}

export default adminFeatured
