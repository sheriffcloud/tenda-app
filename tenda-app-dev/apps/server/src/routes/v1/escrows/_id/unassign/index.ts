/**
 * POST /v1/escrows/:id/unassign — approval mode: the creator withdraws an
 * assignment inside the window.
 *
 * State machine: accepted → open (the one BACKWARD edge). The window and the
 * approval-mode requirement are both mirrored from the contracts, so a
 * transaction the chain would reject is refused here first rather than costing
 * the poster gas to discover.
 *
 * Nothing is written: the escrow moves only when the transaction confirms and
 * the event applier applies `AssignmentReleased`.
 */

import type { FastifyPluginAsync } from 'fastify'
import { getPlatformConfig } from '@server/lib/platform'
import { requireProfileComplete } from '@server/lib/guards'
import { assertCanTransact } from '@server/lib/auth/resolver'
import { guardTransition } from '@server/lib/escrow-routes'
import { buildEscrowTx, partyCaller } from '@server/lib/escrow'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string } }>(
    '/',
    { preHandler: [fastify.authenticate, requireProfileComplete] },
    async (request) => {
      const cfg = await getPlatformConfig(fastify.db)
      const { escrow, caller } = await guardTransition({
        db: fastify.db,
        escrow_id: request.params.id,
        user_id: request.user.id,
        role: request.user.role,
        now: new Date(),
        grace_period_seconds: cfg.grace_period_seconds,
        transition: 'unassign',
      })
      const adapter = fastify.chains.get(escrow.chain_id)
      await assertCanTransact(fastify.db, request.user.id, adapter.namespace)
      const unsigned = await buildEscrowTx(fastify, escrow, {
        action: 'unassign',
        user_id: request.user.id,
        caller: partyCaller(caller),
        payload: { escrow_id: escrow.id },
      })
      return { unsigned }
    },
  )
}

export default route
