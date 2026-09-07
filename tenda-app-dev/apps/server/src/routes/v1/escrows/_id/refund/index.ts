/**
 * POST /v1/escrows/:id/refund, creator recovers funds.
 *
 * The same client-facing endpoint covers two distinct on-chain transitions
 * (per stage-0-foundation.md state machine):
 *   - `refund_expired`: status='open' AND now >= accept_deadline (no one
 *     accepted).
 *   - `reclaim_abandoned`: status='accepted' AND now >= completion_deadline
 *     + grace (counterparty ghosted).
 *
 * The handler picks the transition + on-chain action from the row's current
 * status. State-machine guards in `lib/escrow.ts` enforce the time gates.
 */

import type { FastifyPluginAsync } from 'fastify'
import { AppError } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'
import { getPlatformConfig } from '@server/lib/platform'
import {
  buildContext,
  loadEscrowOr404,
  requireCaller,
} from '@server/lib/escrow-routes'
import { assertCanTransition, buildEscrowTx, partyCaller } from '@server/lib/escrow'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string } }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const cfg = await getPlatformConfig(fastify.db)
      const escrow = await loadEscrowOr404(fastify.db, request.params.id)
      const caller = requireCaller({
        user_id: request.user.id,
        role: request.user.role,
        escrow,
      })
      const ctx = buildContext({
        escrow,
        caller,
        now: new Date(),
        grace_period_seconds: cfg.grace_period_seconds,
      })

      // Pick the transition that matches the current status.
      const transition = escrow.status === 'open'
        ? 'refund_expired'
        : escrow.status === 'accepted'
        ? 'reclaim_abandoned'
        : null
      if (transition === null) {
        throw new AppError(
          409,
          ErrorCode.ESCROW_WRONG_STATUS,
          `refund not available from status '${escrow.status}'`,
        )
      }
      assertCanTransition(ctx, transition)

      // Map to the on-chain action name (1:1 with the contract IX).
      const action = transition === 'refund_expired' ? 'refundExpired' : 'reclaimAbandoned'
      const unsigned = await buildEscrowTx(fastify, escrow, {
        action,
        user_id: request.user.id,
        caller: partyCaller(caller),
        payload: { escrow_id: escrow.id },
      })
      return { unsigned }
    },
  )
}

export default route
