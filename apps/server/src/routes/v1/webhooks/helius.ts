/**
 * POST /v1/webhooks/helius, managed-listener push (stage-2-listeners.md).
 *
 * Auth: Helius sends a configured shared secret in the Authorization
 * header (their webhook auth model is a static header, not payload HMAC,
 * documented deviation from the stage doc's "HMAC" shorthand). Compared
 * timing-safe; tampered/absent → 401. Secret unset (#43 pending) → 503,
 * and the polling fallback + reconciliation carry verification.
 *
 * The payload is treated as a NOTIFICATION ONLY (stage-2 risk table):
 * we extract signatures and enqueue idempotent verify-tx jobs without an
 * expected_event, the job re-fetches and decodes from the chain, which is
 * the source of truth. Always 200 fast so Helius doesn't disable the hook.
 */

import { timingSafeEqual } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { solanaSecret } from '@server/chains/secrets'
import { verifyTxDedupKey } from '@server/jobs/verify-tx'

/** Defensive signature extraction from Helius enhanced-webhook items. */
export function extractSignatures(payload: unknown): string[] {
  if (!Array.isArray(payload)) return []
  const out: string[] = []
  for (const item of payload) {
    if (typeof item === 'object' && item !== null && 'signature' in item) {
      const sig = (item as { signature: unknown }).signature
      if (typeof sig === 'string' && sig.length > 0) out.push(sig)
    }
  }
  return out
}

export function authHeaderMatches(header: string | undefined, secret: string): boolean {
  if (header === undefined) return false
  const a = Buffer.from(header)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: unknown }>('/', async (request, reply) => {
    const solana = solanaSecret()
    if (solana?.webhookSecret === undefined) {
      throw new AppError(
        503,
        ErrorCode.INTERNAL_ERROR,
        'Helius webhook not configured (Solana chain WEBHOOK_SECRET unset)',
      )
    }
    if (!authHeaderMatches(request.headers.authorization, solana.webhookSecret)) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'webhook authorization mismatch')
    }

    // One Solana chain per deployment (registry invariant).
    const chain = fastify.chains.list().find((a) => a.namespace === 'solana')
    if (chain === undefined) {
      throw new AppError(503, ErrorCode.INTERNAL_ERROR, 'no solana adapter registered')
    }

    const signatures = extractSignatures(request.body)
    let enqueued = 0
    for (const tx_ref of signatures) {
      try {
        await fastify.queue.enqueue(
          'verify-tx',
          { chain_id: chain.chain_id, tx_ref, source: 'webhook' },
          { job_id: verifyTxDedupKey({ chain_id: chain.chain_id, tx_ref, event: 'Any' }) },
        )
        enqueued += 1
      } catch (err) {
        // Queue down, reconciliation sweeps tx_attempts; webhook-only txs
        // (no client ping) are re-pushed by Helius retries.
        request.log.warn({ err, tx_ref }, 'helius webhook: enqueue failed')
      }
    }
    return reply.code(200).send({ received: signatures.length, enqueued })
  })
}

export default route
