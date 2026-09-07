import { FastifyPluginAsync } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { drizzleTxAttemptsStore, recordTxAttempt } from '@server/lib/tx-attempts'
import { isEscrowTxType } from '@server/chains/types'

interface ClientPingBody {
  tx_ref?: unknown
  action?: unknown
  escrow_id?: unknown
  chain_id?: unknown
}

const transaction: FastifyPluginAsync = async (fastify) => {
  // POST /v1/blockchain/transaction, client-ping after broadcasting a tx
  // (cutover §3). Records the attempt in tx_attempts and enqueues the
  // idempotent verify-tx job; responds 202 immediately, verification is
  // never in the request path. Replays are no-ops (tx_ref UNIQUE + job_id
  // dedup), so the client can ping freely on retry.
  fastify.post<{ Body: ClientPingBody }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = request.body ?? {}
      if (typeof body.tx_ref !== 'string' || body.tx_ref === '') {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'tx_ref is required')
      }
      if (!isEscrowTxType(body.action)) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'action is not a known escrow action')
      }
      if (typeof body.chain_id !== 'string' || !fastify.chains.has(body.chain_id)) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'chain_id is not registered')
      }
      const escrow_id =
        typeof body.escrow_id === 'string' && body.escrow_id !== '' ? body.escrow_id : null

      const adapter = fastify.chains.get(body.chain_id)
      const result = await recordTxAttempt(
        { store: drizzleTxAttemptsStore(fastify.db), queue: fastify.queue, log: request.log },
        {
          user_id: request.user.id,
          escrow_id,
          action: body.action,
          tx_ref: body.tx_ref,
          chain_id: body.chain_id,
          chain_ns: adapter.namespace,
        },
      )
      return reply.code(202).send({ status: 'queued', ...result })
    },
  )

}

export default transaction
