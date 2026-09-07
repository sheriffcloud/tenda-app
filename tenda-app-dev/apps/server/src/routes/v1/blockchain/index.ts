/**
 * /v1/blockchain, explicit module registration (same rule as v1/admin:
 * with an index file present, @fastify/autoload loads ONLY the index, so
 * every module must be registered here with its prefix).
 *
 * NB this index also FIXES a silent drift: without it, transaction.ts was
 * auto-loaded at the bare `/v1/blockchain` while the shared routes map (and
 * mobile) call `/v1/blockchain/transaction`, the client-ping 404ed and tx
 * verification survived only on the webhook/reconcile fallbacks.
 */

import type { FastifyPluginAsync } from 'fastify'
import transaction from './transaction'
import permitPayload from './permit-payload'

const blockchainRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(transaction, { prefix: '/transaction' })
  await fastify.register(permitPayload, { prefix: '/permit-payload' })
}

export default blockchainRoutes
