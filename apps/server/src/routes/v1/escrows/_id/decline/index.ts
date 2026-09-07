/**
 * POST /v1/escrows/:id/decline, assigned counterparty declines.
 *
 * State machine: open → open (status unchanged); on-chain action clears the
 * assignment so the gig becomes publicly acceptable. No penalty.
 */

import type { FastifyPluginAsync } from 'fastify'
import { getPlatformConfig } from '@server/lib/platform'
import { requireProfileComplete } from '@server/lib/guards'
import { guardTransition } from '@server/lib/escrow-routes'
import { buildEscrowTx } from '@server/lib/escrow'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string } }>(
    '/',
    { preHandler: [fastify.authenticate, requireProfileComplete] },
    async (request) => {
      const cfg = await getPlatformConfig(fastify.db)
      const { escrow } = await guardTransition({
        db: fastify.db,
        escrow_id: request.params.id,
        user_id: request.user.id,
        role: request.user.role,
        now: new Date(),
        grace_period_seconds: cfg.grace_period_seconds,
        transition: 'decline',
      })
      const unsigned = await buildEscrowTx(fastify, escrow, {
        action: 'declineAssignedEscrow',
        user_id: request.user.id,
        payload: { escrow_id: escrow.id },
      })
      return { unsigned }
    },
  )
}

export default route
