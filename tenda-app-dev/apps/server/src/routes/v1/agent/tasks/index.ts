/**
 * POST /v1/agent/tasks — the agent one-shot (#19).
 *
 *   no X-PAYMENT  → 402 AgentTaskPaymentRequired: the draft exists, the
 *                   listing is attached and moderated, `accepts[0]` is what
 *                   to sign, `task_id` is what it funds.
 *   X-PAYMENT     → 201 AgentTaskCreated: relayed and recorded; the task is
 *                   a draft until the chain confirms it (poll GET /v1/gigs/{id}
 *                   with the bearer — it answers the creator's own draft).
 *
 * The same body both times, with the same `creation_operation_id`: that key
 * is what makes the resend land on the draft the 402 quoted. Agent accounts
 * only (403 otherwise); every other gate is the human flow's, unchanged.
 */
import type { FastifyPluginAsync } from 'fastify'
import {
  RELAY_PAYMENT_REQUIRED_MESSAGE,
  X402_VERSION,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  type AgentTaskBody,
  type AgentTaskCreated,
  type AgentTaskPaymentRequired,
} from '@tenda/shared'
import { requireBody } from '@server/lib/errors'
import { decodePaymentHeader, encodeSettlementHeader } from '@server/lib/x402'
import { requireGoodStanding } from '@server/features/reputation/guards'
import { createAgentTask } from '@server/features/agent/createAgentTask'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Partial<AgentTaskBody> | null }>(
    '/',
    {
      preHandler: [fastify.authenticate, requireGoodStanding('create')],
      // Live RPC reads on every call plus, with a header, a relayed broadcast
      // the hot wallet pays for — bounded per IP, the app's rate-limit key.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      // Parsed FIRST: a malformed header is a 400 before any work.
      const payment = decodePaymentHeader(request.headers[X_PAYMENT_HEADER])
      const outcome = await createAgentTask(fastify, {
        user_id: request.user.id,
        body: requireBody(request.body),
        payment,
        log: request.log,
      })
      if (outcome.kind === 'payment_required') {
        const body: AgentTaskPaymentRequired = {
          x402Version: X402_VERSION,
          accepts: [outcome.terms],
          error: RELAY_PAYMENT_REQUIRED_MESSAGE,
          task_id: outcome.task_id,
        }
        return reply.code(402).send(body)
      }
      const body: AgentTaskCreated = {
        task_id: outcome.task_id,
        tx_ref: outcome.tx_ref,
        status: 'draft',
        recorded: outcome.recorded,
        enqueued: outcome.enqueued,
      }
      return reply
        .code(201)
        .header(X_PAYMENT_RESPONSE_HEADER, encodeSettlementHeader(outcome.settlement))
        .send(body)
    },
  )
}

export default route
