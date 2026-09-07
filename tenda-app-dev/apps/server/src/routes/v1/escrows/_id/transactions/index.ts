/**
 * GET /v1/escrows/:id/transactions, list confirmed transactions on this
 * escrow, oldest first. Read-only audit trail; any party may read.
 *
 * NO CLIENT CALLS THIS TODAY (#120), recorded here so the next reader does not
 * have to work it out. Checked rather than assumed: the path appears in neither
 * `packages/shared/src/api/routes.ts` nor `apps/admin/api/routes.ts`, which are
 * the only two route maps in the repo.
 *
 * IT IS NOT DEAD, and the difference matters. The rows reach an ADMIN through
 * the dossier (`lib/escrow/dossier.ts` runs the same query) and reach a user's
 * own wallet history through GET /v1/users/:id/transactions, which is
 * role-scoped per TX_FEED_VISIBILITY. Neither answers "what happened on chain
 * for THIS escrow" for a PARTY to it — that is what this serves, and no other
 * endpoint does.
 *
 * The guard is exercised: `escrow-refusals.test.ts` drives this URL for a
 * stranger (403, no role on escrow) and for the creator (200), which is why the
 * file measures 100% despite having no caller in any client.
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
