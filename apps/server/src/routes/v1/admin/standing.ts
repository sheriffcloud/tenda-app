/**
 * Admin standing tools (stage-7):
 *   GET  /v1/admin/standing/:user_id            full standing detail
 *   POST /v1/admin/standing/:user_id/override   { action, reason }
 *
 * Every override is recorded in standing_overrides, immutable audit
 * trail with the acting admin and reason.
 */

import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { standing_overrides } from '@tenda/shared/db/schema/reputation'
import { AppError } from '@server/lib/errors'
import { requirePermission, uuidParamGuard } from '@server/lib/guards'
import { applyFraudConfirmed } from '@server/features/reputation/service'
import { computeDisputeRate } from '@server/features/reputation/fraud-flag'
import { drizzleReputationStore } from '@server/features/reputation/store'

const OVERRIDE_ACTIONS = [
  'lift_restriction',
  'apply_restriction',
  'reset_counters',
  'mark_fraud',
] as const
type OverrideAction = (typeof OVERRIDE_ACTIONS)[number]

interface OverrideBody {
  action?: unknown
  reason?: unknown
}

function narrowAction(v: unknown): OverrideAction {
  if (typeof v === 'string' && (OVERRIDE_ACTIONS as readonly string[]).includes(v)) {
    return v as OverrideAction
  }
  throw new AppError(
    422,
    ErrorCode.VALIDATION_ERROR,
    `action must be one of: ${OVERRIDE_ACTIONS.join(' | ')}`,
  )
}

const route: FastifyPluginAsync = async (fastify) => {
  // Malformed id reaches postgres as a uuid comparison and throws; answer
  // it the way an unknown id already is.
  fastify.addHook('preHandler', uuidParamGuard('User not found', { code: ErrorCode.USER_NOT_FOUND, param: 'user_id' }))

  fastify.get<{ Params: { user_id: string } }>(
    '/:user_id',
    { preHandler: [fastify.authenticate, requirePermission('standing.read')] },
    async (request) => {
      const standing = await drizzleReputationStore(fastify.db).getStanding(
        request.params.user_id,
      )
      if (standing === null) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'no standing record for this user')
      }
      // #82: live dispute-rate metric, FLAG only, never auto-restricts.
      const dispute_metric = await computeDisputeRate(fastify.db, request.params.user_id)
      return { standing, dispute_metric }
    },
  )

  fastify.post<{ Params: { user_id: string }; Body: OverrideBody }>(
    '/:user_id/override',
    { preHandler: [fastify.authenticate, requirePermission('standing.manage')] },
    async (request) => {
      const action = narrowAction(request.body?.action)
      const reason = request.body?.reason
      if (typeof reason !== 'string' || reason.length === 0) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'reason is required')
      }
      const user_id = request.params.user_id
      const store = drizzleReputationStore(fastify.db)

      switch (action) {
        case 'lift_restriction':
          await store.clearRestriction(user_id)
          break
        case 'apply_restriction':
          // Admin-applied review hold; lift via lift_restriction.
          await store.setRestriction(user_id, {
            kind: 'manual_review',
            until: null,
            reason,
          })
          break
        case 'reset_counters':
          // Lifetime counters zeroed; standing_events stay for audit (the
          // windowed tiers therefore still see recent behaviour, admin
          // lifts restrictions separately and deliberately).
          await store.resetCounters(user_id)
          break
        case 'mark_fraud':
          await applyFraudConfirmed(
            {
              store,
              emit: {
                async restricted() {
                  // Notification fan-out lands with the worker wiring (#33).
                },
                async cleared() {},
              },
              now: () => new Date(),
            },
            { user_id, escrow_id: null, role: 'counterparty' },
          )
          break
      }

      await fastify.db.insert(standing_overrides).values({
        user_id,
        action,
        reason,
        applied_by: request.user.id,
      })
      return { applied: action }
    },
  )
}

export default route
