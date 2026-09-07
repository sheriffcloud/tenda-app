/**
 * GET /v1/escrows/:id, return the escrow row + appropriate details satellite.
 *
 * Authorization: any party with a role on the escrow (creator, counterparty,
 * assigned, or dispute_admin) may read. Stage 0 returns just the base row;
 * satellite-table merging (gig_details / exchange_details) lands in a
 * follow-up pass when those routes consolidate (#37).
 */

import type { FastifyPluginAsync } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import { loadEscrowOr404, deriveCaller } from '@server/lib/escrow-routes'
import { AppError } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'
import { hasPendingEscrowCreateTransaction } from '@server/features/escrows/creation/hasPendingEscrowCreateTransaction'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { id: string } }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const escrow = await loadEscrowOr404(fastify.db, request.params.id)
      const caller = deriveCaller({
        user_id: request.user.id,
        role: request.user.role,
        escrow,
      })
      if (caller === null) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          `user has no role on escrow ${escrow.id}`,
        )
      }
      return { escrow }
    },
  )

  // DELETE /v1/escrows/:id, discard an abandoned DRAFT (a staging row the
  // creator never signed; nothing exists on-chain). Published escrows
  // unwind through the on-chain cancel/refund transitions instead.
  fastify.delete<{ Params: { id: string } }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const escrow = await loadEscrowOr404(fastify.db, request.params.id)
      if (escrow.creator_id !== request.user.id) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Only the creator can discard a draft')
      }
      if (escrow.status !== 'draft') {
        throw new AppError(
          409,
          ErrorCode.ESCROW_WRONG_STATUS,
          'Only drafts can be deleted, published escrows are cancelled on-chain',
        )
      }
      // A signed-and-broadcast create tx leaves the row 'draft' until the
      // verifier confirms it. Deleting in that window would orphan an
      // on-chain funded escrow with no server record, block while a
      // create ping is pending (failed/expired attempts don't count).
      if (await hasPendingEscrowCreateTransaction(fastify.db, escrow.id)) {
        throw new AppError(
          409,
          ErrorCode.ESCROW_WRONG_STATUS,
          'A create transaction is awaiting confirmation, wait for it to settle before discarding',
        )
      }
      // Status guard inside the DELETE so a create-tx confirming between
      // the SELECT and here (draft → open) can't destroy a live escrow;
      // the details satellite rows cascade.
      const deleted = await fastify.db
        .delete(escrows)
        .where(and(eq(escrows.id, escrow.id), eq(escrows.status, 'draft')))
        .returning({ id: escrows.id })
      if (deleted.length === 0) {
        throw new AppError(
          409,
          ErrorCode.ESCROW_WRONG_STATUS,
          'Escrow left draft state, it may have just been published',
        )
      }
      return { deleted: true }
    },
  )
}

export default route
