/**
 * GET /v1/escrows/:id/transactions, list confirmed transactions on this
 * escrow, oldest first. Read-only audit trail; any party may read.
 */

import type { FastifyPluginAsync } from 'fastify'
import { asc, eq } from 'drizzle-orm'
import { escrow_transactions } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'
import { deriveCaller, loadEscrowOr404 } from '@server/lib/escrow-routes'

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
        throw new AppError(403, ErrorCode.FORBIDDEN, 'no role on escrow')
      }
      const rows = await fastify.db
        .select()
        .from(escrow_transactions)
        .where(eq(escrow_transactions.escrow_id, escrow.id))
        .orderBy(asc(escrow_transactions.created_at))
      return { transactions: rows }
    },
  )
}

export default route
