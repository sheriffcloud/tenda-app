/**
 * POST /v1/escrows/:id/cancel, creator unwinds before any acceptance.
 * State machine: open (no counterparty acted) → cancelled.
 */

import type { FastifyPluginAsync } from 'fastify'
import { getPlatformConfig } from '@server/lib/platform'
import { guardTransition } from '@server/lib/escrow-routes'
import { buildEscrowTx, partyCaller } from '@server/lib/escrow'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string } }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const cfg = await getPlatformConfig(fastify.db)
      const { escrow, caller } = await guardTransition({
        db: fastify.db,
        escrow_id: request.params.id,
        user_id: request.user.id,
        role: request.user.role,
        now: new Date(),
        grace_period_seconds: cfg.grace_period_seconds,
        transition: 'cancel',
      })
      const unsigned = await buildEscrowTx(fastify, escrow, {
        action: 'cancelEscrow',
        user_id: request.user.id,
        caller: partyCaller(caller),
        payload: { escrow_id: escrow.id },
      })
      return { unsigned }
    },
  )
}

export default route
