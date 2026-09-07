/**
 * POST /v1/auth/nonce, issue a single-use auth nonce.
 *
 * No body, no auth. Response goes into the client's auth-message template
 * under `Nonce: {nonce}`. The client signs the full message; the wallet
 * route consumes the nonce when verifying the signature, so re-issuing the
 * same client a second nonce before they spend the first is fine, the
 * first becomes useless after expiry (300s).
 */

import type { FastifyPluginAsync } from 'fastify'
import { drizzleNonceStore, issueNonce } from '@server/lib/nonce'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async () => {
    return issueNonce(drizzleNonceStore(fastify.db))
  })
}

export default route
