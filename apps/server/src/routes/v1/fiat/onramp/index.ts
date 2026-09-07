/**
 * POST /v1/fiat/onramp { intent_id }, initiate a quoted onramp intent
 * (stage-8 § Onramp pipeline step 4). Returns the PaymentInstruction the
 * user follows (bank transfer / redirect / USSD).
 */

import type { FastifyPluginAsync } from 'fastify'
import { buildFiatDeps, initiateIntent } from '@server/features/fiat-rails'
import { requireFiatRails, requireStr } from '@server/lib/fiat-routes'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { intent_id?: unknown } }>(
    '/',
    {
      preHandler: [fastify.authenticate, requireFiatRails],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const intent_id = requireStr('intent_id', request.body?.intent_id, 100)
      const deps = await buildFiatDeps(fastify)
      // The direction guard (quote must be an onramp) lives in initiateIntent.
      return initiateIntent(deps, request.user.id, intent_id, { expected_direction: 'onramp' })
    },
  )
}

export default route
