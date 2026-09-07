/**
 * POST /v1/escrows/:id/claim, counterparty claims after approval_deadline
 * (creator ghosted). State machine: submitted → completed, time-gated.
 */

import type { FastifyPluginAsync } from 'fastify'
import { getPlatformConfig } from '@server/lib/platform'
import { guardTransition } from '@server/lib/escrow-routes'
import { buildEscrowTx } from '@server/lib/escrow'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string } }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const cfg = await getPlatformConfig(fastify.db)
      const { escrow } = await guardTransition({
        db: fastify.db,
        escrow_id: request.params.id,
        user_id: request.user.id,
        role: request.user.role,
        now: new Date(),
        grace_period_seconds: cfg.grace_period_seconds,
        transition: 'claim_stalled',
      })
      const unsigned = await buildEscrowTx(fastify, escrow, {
        action: 'claimStalledPayment',
        user_id: request.user.id,
        payload: { escrow_id: escrow.id },
      })
      return { unsigned }
    },
  )
}

export default route
