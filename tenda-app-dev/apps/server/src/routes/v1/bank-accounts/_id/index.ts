/** DELETE /v1/bank-accounts/:id, remove a saved account. */

import type { FastifyPluginAsync } from 'fastify'
import { uuidParamGuard } from '@server/lib/guards'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { drizzleBankAccountStore } from '@server/features/fiat-rails'
import { requireFiatRails } from '@server/lib/fiat-routes'

const route: FastifyPluginAsync = async (fastify) => {
  // Malformed `:id` reaches postgres as a uuid comparison and throws;
  // answer it the way an unknown id is already answered.
  fastify.addHook('preHandler', uuidParamGuard('bank account not found'))

  fastify.delete<{ Params: { id: string } }>(
    '/',
    { preHandler: [fastify.authenticate, requireFiatRails] },
    async (request) => {
      const removed = await drizzleBankAccountStore(fastify.db).remove(request.user.id, request.params.id)
      if (!removed) throw new AppError(404, ErrorCode.NOT_FOUND, 'bank account not found')
      return { deleted: true }
    },
  )
}

export default route
