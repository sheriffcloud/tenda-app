/**
 * Admin fiat tools (stage-8 § Admin):
 *   GET   /v1/admin/fiat/intents                 list + filter
 *   GET   /v1/admin/fiat/intents/:id             full detail
 *   POST  /v1/admin/fiat/intents/:id/force-settle  after manual provider reconciliation
 *   POST  /v1/admin/fiat/intents/:id/refund        mark refunded (provider moves the fiat)
 *   GET   /v1/admin/fiat/providers               registry rows
 *   PATCH /v1/admin/fiat/providers/:id           enable/disable, priority
 *
 * Overrides require a reason and are appended to the intent's metadata,
 * the row itself is the audit trail (admin id + reason + timestamp).
 */

import type { FastifyPluginAsync } from 'fastify'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { ErrorCode } from '@tenda/shared'
import { fiat_intents, fiat_providers, fiatIntentStatusEnum, type FiatIntentStatus } from '@tenda/shared/db/schema/fiat'
import { AppError } from '@server/lib/errors'
import { requirePermission, uuidParamGuard } from '@server/lib/guards'
import { buildFiatDeps } from '@server/features/fiat-rails'

const LIST_LIMIT = 50

interface OverrideBody {
  reason?: unknown
}

function requireReason(body: OverrideBody | undefined): string {
  const reason = body?.reason
  if (typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 1000) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'reason is required (≤1000 chars)')
  }
  return reason.trim()
}

const route: FastifyPluginAsync = async (fastify) => {
  // Route-level, NOT a plugin hook: `/providers/:id` in this same plugin
  // keys on fiat_providers.id, a TEXT column ('p2p_internal'), so a
  // plugin-wide uuid guard would 404 a working endpoint.
  const intentIdGuard = uuidParamGuard('intent not found')

  fastify.get<{ Querystring: { status?: string; provider?: string; user_id?: string } }>(
    '/intents',
    { preHandler: [fastify.authenticate, requirePermission('fiat.read')] },
    async (request) => {
      const { status, provider, user_id } = request.query
      const filters = []
      if (status !== undefined) {
        // Validate against the enum, junk filters 422 instead of a DB error.
        const valid = fiatIntentStatusEnum.enumValues as readonly string[]
        const wanted = status.split(',').filter((v): v is FiatIntentStatus => valid.includes(v))
        if (wanted.length !== status.split(',').length) {
          throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'unknown status filter')
        }
        filters.push(inArray(fiat_intents.status, wanted))
      }
      if (provider !== undefined) filters.push(eq(fiat_intents.provider, provider))
      if (user_id !== undefined) filters.push(eq(fiat_intents.user_id, user_id))

      const rows = await fastify.db
        .select()
        .from(fiat_intents)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(desc(fiat_intents.created_at))
        .limit(LIST_LIMIT)
      return { intents: rows }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/intents/:id',
    { preHandler: [fastify.authenticate, intentIdGuard, requirePermission('fiat.read')] },
    async (request) => {
      const [row] = await fastify.db
        .select()
        .from(fiat_intents)
        .where(eq(fiat_intents.id, request.params.id))
        .limit(1)
      if (row === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'intent not found')
      return { intent: row }
    },
  )

  fastify.post<{ Params: { id: string }; Body: OverrideBody }>(
    '/intents/:id/force-settle',
    { preHandler: [fastify.authenticate, intentIdGuard, requirePermission('fiat.manage')] },
    async (request) => {
      const reason = requireReason(request.body)
      const deps = await buildFiatDeps(fastify)
      const intent = await deps.store.getIntent(request.params.id)
      if (intent === null) throw new AppError(404, ErrorCode.NOT_FOUND, 'intent not found')

      const meta = (intent.metadata ?? {}) as Record<string, unknown>
      const updated = await deps.store.transition(
        intent.id,
        ['quoted', 'awaiting_user', 'awaiting_provider', 'settling'],
        {
          status: 'settled',
          metadata: {
            ...meta,
            admin_override: { action: 'force_settle', by: request.user.id, reason, at: new Date().toISOString() },
          },
        },
      )
      if (updated === null) {
        throw new AppError(409, ErrorCode.VALIDATION_ERROR, `intent is ${intent.status}, cannot force-settle`)
      }
      deps.events.settled({
        intent_id: updated.id,
        user_id: updated.user_id,
        direction: updated.direction,
        fiat_currency: updated.fiat_currency,
        fiat_amount: updated.fiat_amount,
        asset: updated.asset,
        asset_amount_raw: updated.asset_amount_raw,
      })
      return { intent: updated }
    },
  )

  fastify.post<{ Params: { id: string }; Body: OverrideBody }>(
    '/intents/:id/refund',
    { preHandler: [fastify.authenticate, intentIdGuard, requirePermission('fiat.manage')] },
    async (request) => {
      const reason = requireReason(request.body)
      const deps = await buildFiatDeps(fastify)
      const intent = await deps.store.getIntent(request.params.id)
      if (intent === null) throw new AppError(404, ErrorCode.NOT_FOUND, 'intent not found')

      const meta = (intent.metadata ?? {}) as Record<string, unknown>
      const updated = await deps.store.transition(
        intent.id,
        ['quoted', 'awaiting_user', 'awaiting_provider', 'settling'],
        {
          status: 'failed',
          metadata: {
            ...meta,
            admin_override: { action: 'refund', by: request.user.id, reason, at: new Date().toISOString() },
          },
        },
      )
      if (updated === null) {
        throw new AppError(409, ErrorCode.VALIDATION_ERROR, `intent is ${intent.status}, cannot mark refunded`)
      }
      return { intent: updated }
    },
  )

  fastify.get(
    '/providers',
    { preHandler: [fastify.authenticate, requirePermission('fiat.read')] },
    async () => {
      const rows = await fastify.db.select().from(fiat_providers).orderBy(fiat_providers.priority)
      return { providers: rows }
    },
  )

  fastify.patch<{ Params: { id: string }; Body: { is_enabled?: unknown; priority?: unknown } }>(
    '/providers/:id',
    { preHandler: [fastify.authenticate, requirePermission('fiat.manage')] },
    async (request) => {
      const b = request.body ?? {}
      const patch: { is_enabled?: boolean; priority?: number } = {}
      if (b.is_enabled !== undefined) {
        if (typeof b.is_enabled !== 'boolean') {
          throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'is_enabled must be a boolean')
        }
        patch.is_enabled = b.is_enabled
      }
      if (b.priority !== undefined) {
        if (typeof b.priority !== 'number' || !Number.isInteger(b.priority) || b.priority < 0) {
          throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'priority must be a non-negative integer')
        }
        patch.priority = b.priority
      }
      if (Object.keys(patch).length === 0) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'nothing to update')
      }
      const [row] = await fastify.db
        .update(fiat_providers)
        .set(patch)
        .where(eq(fiat_providers.id, request.params.id))
        .returning()
      if (row === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'provider not found')
      return { provider: row }
    },
  )

}

export default route
