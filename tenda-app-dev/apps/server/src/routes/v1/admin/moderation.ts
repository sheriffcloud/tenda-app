/**
 * Admin moderation tools (stage-6):
 *   GET  /v1/admin/moderation/verdicts                audit log (filterable)
 *   POST /v1/admin/moderation/verdicts/:id/override   reverse a block
 *
 * An override never mutates the original verdict, it appends a NEW
 * approve verdict (provider='admin') referencing the same input hash and
 * bumps moderation_rules_version so cached block verdicts die lazily.
 */

import type { FastifyPluginAsync } from 'fastify'
import { desc, eq, sql } from 'drizzle-orm'
import { ErrorCode } from '@tenda/shared'
import { moderation_verdicts } from '@tenda/shared/db/schema/moderation'
import { platform_config } from '@tenda/shared/db/schema/governance'
import { AppError } from '@server/lib/errors'
import { requirePermission } from '@server/lib/guards'

const PAGE_SIZE = 50

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { decision?: string; page?: string } }>(
    '/verdicts',
    { preHandler: [fastify.authenticate, requirePermission('moderation.read')] },
    async (request) => {
      const page = Math.max(Number(request.query.page ?? '0') || 0, 0)
      const decision = request.query.decision
      const where =
        decision === 'approve' || decision === 'warn' || decision === 'block'
          ? eq(moderation_verdicts.decision, decision)
          : undefined
      const rows = await fastify.db
        .select()
        .from(moderation_verdicts)
        .where(where)
        .orderBy(desc(moderation_verdicts.created_at))
        .limit(PAGE_SIZE)
        .offset(page * PAGE_SIZE)
      return { verdicts: rows, page }
    },
  )

  fastify.post<{ Params: { id: string }; Body: { reason?: unknown } }>(
    '/verdicts/:id/override',
    { preHandler: [fastify.authenticate, requirePermission('moderation.override')] },
    async (request) => {
      const reason = request.body?.reason
      if (typeof reason !== 'string' || reason.length === 0) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'reason is required')
      }
      const [original] = await fastify.db
        .select()
        .from(moderation_verdicts)
        .where(eq(moderation_verdicts.id, request.params.id))
        .limit(1)
      if (original === undefined) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'verdict not found')
      }

      const [override] = await fastify.db
        .insert(moderation_verdicts)
        .values({
          subject_kind: original.subject_kind,
          subject_id: original.subject_id,
          input_hash: original.input_hash,
          decision: 'approve',
          reasons: [{ code: 'ADMIN_OVERRIDE', message: reason, severity: 'info' }],
          provider: 'admin',
        })
        .returning({ id: moderation_verdicts.id })

      // Bump the rules epoch: cached verdicts under the old version become
      // unreachable (lazy invalidation, no mass delete).
      await fastify.db
        .update(platform_config)
        .set({
          moderation_rules_version: sql`${platform_config.moderation_rules_version} + 1`,
        })
        .where(eq(platform_config.id, 1))

      return { override_id: override?.id, original_id: original.id }
    },
  )
}

export default route
