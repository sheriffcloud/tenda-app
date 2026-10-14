/**
 * POST /v1/auth/verify, Stage 9 unified verify. Validates the method's proof
 * (OTP code / wallet signature / OAuth id_token) and then:
 *   - anonymous → logs in or creates the account (wallet: login-only, never
 *     creates, decision #3)
 *   - bearer    → links the verified identity to the current account
 * Collisions are blocked (IDENTITY_ALREADY_LINKED), and a verified email maps
 * to exactly one user (cross-method dedup). Returns { token, user, is_new }.
 */

import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { AppError, requireBody, requireNonEmptyString } from '@server/lib/errors'
import { isAuthMethod, type VerifyProof } from '@server/features/auth/strategies/strategy'
import { buildAuthStrategies } from '@server/features/auth/strategies/registry'
import { resolveOrLink, type UserBootstrap } from '@server/features/auth/strategies/orchestrator'
import { mintAuthResponse, sessionClientFromHeaders } from '@server/features/auth/session/session'

interface Body {
  method?: unknown
  identifier?: unknown
  code?: unknown
  chain_id?: unknown
  address?: unknown
  message?: unknown
  signature?: unknown
  id_token?: unknown
  is_seeker?: unknown
  country?: unknown
}

/** Build the discriminated proof for a method, validating its shape (422 on miss). */
function parseProof(method: string, body: Body, bearerUserId: string | null): VerifyProof {
  switch (method) {
    case 'phone':
    case 'email':
      return {
        method,
        identifier: requireNonEmptyString(body.identifier, 'identifier'),
        code: requireNonEmptyString(body.code, 'code'),
        user_id: bearerUserId,
      }
    case 'wallet':
      return {
        method,
        chain_id: requireNonEmptyString(body.chain_id, 'chain_id'),
        address: requireNonEmptyString(body.address, 'address'),
        message: requireNonEmptyString(body.message, 'message'),
        signature: requireNonEmptyString(body.signature, 'signature'),
      }
    case 'google':
    case 'apple':
      return { method, id_token: requireNonEmptyString(body.id_token, 'id_token') }
    default:
      throw new AppError(400, ErrorCode.UNSUPPORTED_AUTH_METHOD, `unknown auth method '${method}'`)
  }
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Body }>(
    '/',
    {
      preHandler: [fastify.optionalAuthenticate],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const body = requireBody(request.body)
      if (!isAuthMethod(body.method)) {
        throw new AppError(400, ErrorCode.UNSUPPORTED_AUTH_METHOD, 'unknown auth method')
      }
      const strategy = buildAuthStrategies(fastify)[body.method]
      if (strategy === undefined) {
        throw new AppError(
          400,
          ErrorCode.UNSUPPORTED_AUTH_METHOD,
          `auth method '${body.method}' is not supported yet`,
        )
      }
      const bearerUserId = request.headers.authorization !== undefined ? request.user.id : null
      const proof = parseProof(body.method, body, bearerUserId)
      const outcome = await strategy.verify(proof)

      const bootstrap: UserBootstrap = {
        is_seeker: typeof body.is_seeker === 'boolean' ? body.is_seeker : undefined,
        country: typeof body.country === 'string' ? body.country : null,
      }
      const { user, isNew } = await resolveOrLink(fastify.db, outcome, bearerUserId, bootstrap)

      return {
        ...mintAuthResponse(fastify, user, sessionClientFromHeaders(request.headers)),
        is_new: isNew,
      }
    },
  )
}

export default route
