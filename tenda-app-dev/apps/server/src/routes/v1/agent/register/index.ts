/**
 * POST /v1/agent/register — a wallet-born agent account (#19).
 *
 * Body: the wallet proof of /v1/auth/verify { method: 'wallet' } (chain_id,
 * address, message signed over a /v1/auth/nonce) plus `name`. Answers the
 * same { token, user, is_new } shape as /v1/auth/verify, so an agent's
 * session is an ordinary bearer from here on (and /v1/auth/verify with
 * method 'wallet' signs it back in).
 */
import type { FastifyPluginAsync } from 'fastify'
import type { AgentRegisterBody, AgentRegisterResponse } from '@tenda/shared'
import { requireBody } from '@server/lib/errors'
import { mintAuthResponse } from '@server/lib/auth/session'
import { registerAgent } from '@server/features/agent/registerAgent'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Partial<AgentRegisterBody> | null; Reply: AgentRegisterResponse }>(
    '/',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const { user, isNew } = await registerAgent(fastify, requireBody(request.body))
      return { ...mintAuthResponse(fastify, user), is_new: isNew }
    },
  )
}

export default route
