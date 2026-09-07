/**
 * POST /v1/webhooks/alchemy, BASE address-activity push (stage-3-base.md).
 *
 * Auth: Alchemy signs the RAW body with HMAC-SHA256 (signing key from the
 * webhook dashboard) in the `x-alchemy-signature` header, verified via
 * core/webhooks/verify-hmac with a scoped raw-body parser (same pattern as
 * the provider webhooks). Tampered/absent → 401; unconfigured → 503 (the
 * polling listener + reconciliation carry verification meanwhile).
 *
 * Payload is a NOTIFICATION ONLY (same stance as the Helius hook): extract
 * tx hashes touching the escrow contract and enqueue idempotent verify-tx
 * jobs, the EVM adapter re-fetches receipts and decodes from the chain,
 * which is the source of truth. Always 200 fast so Alchemy doesn't disable
 * the hook.
 */

import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { paymasterChainSecret } from '@server/chains/secrets'
import { verifyHmac } from '@server/core/webhooks/verify-hmac'
import { verifyTxDedupKey } from '@server/jobs/verify-tx'

const SIGNATURE_HEADER = 'x-alchemy-signature'

interface RawJsonBody {
  raw: string
  json: unknown
}

/** Defensive hash extraction from Alchemy address-activity payloads. */
export function extractTxHashes(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null) return []
  const event = (payload as { event?: unknown }).event
  if (typeof event !== 'object' || event === null) return []
  const activity = (event as { activity?: unknown }).activity
  if (!Array.isArray(activity)) return []
  const out = new Set<string>()
  for (const item of activity) {
    if (typeof item === 'object' && item !== null && 'hash' in item) {
      const hash = (item as { hash: unknown }).hash
      if (typeof hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(hash)) out.add(hash)
    }
  }
  return [...out]
}

const route: FastifyPluginAsync = async (fastify) => {
  // Scoped parser: keep raw bytes for the HMAC + the parsed JSON.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, { raw: body as string, json: JSON.parse(body as string) })
    } catch (err) {
      done(err as Error)
    }
  })

  fastify.post<{ Body: RawJsonBody }>('/', async (request, reply) => {
    // The Alchemy hook serves the active paymaster-managed EVM chain (BASE or
    // its testnet), resolved from the manifest+secrets, never hardcoded.
    const evm = paymasterChainSecret()
    if (evm?.webhookSecret === undefined) {
      throw new AppError(503, ErrorCode.INTERNAL_ERROR, 'Alchemy webhook not configured')
    }
    const signature = request.headers[SIGNATURE_HEADER]
    if (
      typeof signature !== 'string' ||
      !verifyHmac({ payload: request.body.raw, signature, secret: evm.webhookSecret })
    ) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'webhook signature mismatch')
    }

    const chainId = evm.chainId
    if (!fastify.chains.has(chainId)) {
      throw new AppError(503, ErrorCode.INTERNAL_ERROR, 'BASE adapter not registered')
    }

    const hashes = extractTxHashes(request.body.json)
    let enqueued = 0
    for (const tx_ref of hashes) {
      try {
        await fastify.queue.enqueue(
          'verify-tx',
          { chain_id: chainId, tx_ref, source: 'webhook' },
          { job_id: verifyTxDedupKey({ chain_id: chainId, tx_ref, event: 'Any' }) },
        )
        enqueued += 1
      } catch (err) {
        // Queue down (#33 pending), reconciliation covers; never bounce
        // the webhook over it.
        fastify.log.warn({ err, tx_ref }, 'alchemy webhook: enqueue failed')
      }
    }
    return reply.code(200).send({ received: hashes.length, enqueued })
  })
}

export default route
