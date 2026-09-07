/**
 * GET /v1/fiat/intents/:id, intent status for resume-after-restart
 * (stage-8 § Key UX principles: mid-flow exits are graceful).
 */

import type { FastifyPluginAsync } from 'fastify'
import { uuidParamGuard } from '@server/lib/guards'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { buildFiatDeps } from '@server/features/fiat-rails'
import { requireFiatRails } from '@server/lib/fiat-routes'

const route: FastifyPluginAsync = async (fastify) => {
  // Malformed `:id` reaches postgres as a uuid comparison and throws;
  // answer it the way an unknown id is already answered.
  fastify.addHook('preHandler', uuidParamGuard('intent not found'))

  fastify.get<{ Params: { id: string } }>(
    '/',
    { preHandler: [fastify.authenticate, requireFiatRails] },
    async (request) => {
      const deps = await buildFiatDeps(fastify)
      const intent = await deps.store.getIntent(request.params.id)
      if (intent === null || intent.user_id !== request.user.id) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'intent not found')
      }
      const meta = intent.metadata as { instruction?: unknown } | null
      return {
        id: intent.id,
        direction: intent.direction,
        status: intent.status,
        provider: intent.provider,
        fiat_currency: intent.fiat_currency,
        fiat_amount: intent.fiat_amount,
        asset: intent.asset,
        asset_amount_raw: intent.asset_amount_raw,
        rate: intent.rate,
        fee_amount: intent.fee_amount,
        kyc_required: intent.kyc_required,
        kyc_url: intent.kyc_url,
        expires_at: intent.expires_at.toISOString(),
        instruction: meta?.instruction ?? null,
        created_at: intent.created_at.toISOString(),
      }
    },
  )
}

export default route
