/**
 * Provider settlement webhooks (stage-8 § Onramp pipeline step 6).
 *
 * HMAC-SHA256 over the RAW request body (a scoped content-type parser
 * preserves the exact bytes, re-serializing parsed JSON would break
 * signatures on whitespace/key-order). Tampered/absent signatures → 401;
 * unconfigured secret → 503 (reconciliation polling still converges
 * intents while the webhook is dark).
 */

import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { verifyHmac } from '@server/core/webhooks/verify-hmac'
import { getConfig, type Config } from '@server/config'
import { buildFiatDeps } from './index'
import { settleFromProvider, type ProviderOutcome } from './service'

const SIGNATURE_HEADER = 'x-signature'

interface RawJsonBody {
  raw: string
  json: unknown
}

function field(obj: unknown, key: string): unknown {
  return typeof obj === 'object' && obj !== null && key in obj
    ? (obj as Record<string, unknown>)[key]
    : undefined
}

/** Providers report many phases; only terminal ones transition intents. */
export function mapWebhookOutcome(status: unknown): ProviderOutcome | null {
  if (status === 'completed' || status === 'success') return 'completed'
  if (status === 'failed' || status === 'cancelled' || status === 'declined') return 'failed'
  return null
}

export function providerWebhookPlugin(args: {
  provider: string
  secretKey: keyof Pick<Config, 'YELLOWCARD_WEBHOOK_SECRET' | 'ONRAMPMONEY_WEBHOOK_SECRET'>
}): FastifyPluginAsync {
  return async (fastify) => {
    // Scoped parser: keep the raw bytes for HMAC + the parsed JSON.
    fastify.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_req, body, done) => {
        try {
          done(null, { raw: body as string, json: JSON.parse(body as string) })
        } catch (err) {
          done(err as Error)
        }
      },
    )

    fastify.post<{ Body: RawJsonBody }>('/', async (request, reply) => {
      const secret = getConfig()[args.secretKey]
      if (secret === null) {
        throw new AppError(503, ErrorCode.INTERNAL_ERROR, `${args.provider} webhook not configured`)
      }
      const signature = request.headers[SIGNATURE_HEADER]
      if (
        typeof signature !== 'string' ||
        !verifyHmac({ payload: request.body.raw, signature, secret })
      ) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'webhook signature mismatch')
      }

      const payload = request.body.json
      const provider_ref = field(payload, 'provider_ref') ?? field(payload, 'ref')
      if (typeof provider_ref !== 'string' || provider_ref.length === 0) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'payload missing provider_ref')
      }
      const outcome = mapWebhookOutcome(field(payload, 'status'))
      if (outcome === null) {
        // Non-terminal phase update, acknowledge without transitioning.
        return reply.code(202).send({ ok: true })
      }

      const reason = field(payload, 'reason')
      const deps = await buildFiatDeps(fastify)
      await settleFromProvider(deps, {
        provider: args.provider,
        provider_ref,
        outcome,
        reason: typeof reason === 'string' ? reason : undefined,
      })
      // 200 even for unknown refs (logged + dropped), retry storms from
      // the provider gain nothing.
      return reply.code(200).send({ ok: true })
    })
  }
}
