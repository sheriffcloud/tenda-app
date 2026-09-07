/**
 * POST /v1/auth/challenge, Stage 9 unified challenge. Issues a credential
 * challenge for the given method:
 *   - phone / email → sends an OTP (202 { expires_in })
 *   - wallet        → use POST /v1/auth/nonce instead (no challenge here)
 *   - google/apple  → challenged on-device by the native SDK
 *
 * Optional auth: a bearer binds the OTP to the current user (link flow);
 * anonymous issues a pre-account code (passwordless sign-in). Per-IP rate
 * limited on top of the per-identifier DB cap (lib/otp), the public surface
 * must not become an SMS/email-cost or enumeration oracle.
 */

import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { AppError, requireBody } from '@server/lib/errors'
import { isAuthMethod } from '@server/lib/auth/strategy'
import { buildAuthStrategies } from '@server/lib/auth/registry'

interface Body {
  method?: unknown
  identifier?: unknown
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Body }>(
    '/',
    {
      preHandler: [fastify.optionalAuthenticate],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = requireBody(request.body)
      if (!isAuthMethod(body.method)) {
        throw new AppError(400, ErrorCode.UNSUPPORTED_AUTH_METHOD, 'unknown auth method')
      }
      if (typeof body.identifier !== 'string' || body.identifier === '') {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'identifier is required')
      }
      const strategy = buildAuthStrategies(fastify)[body.method]
      if (strategy?.challenge === undefined) {
        throw new AppError(
          400,
          ErrorCode.UNSUPPORTED_AUTH_METHOD,
          `method '${body.method}' does not support a challenge`,
        )
      }
      const bearerUserId = request.headers.authorization !== undefined ? request.user.id : null
      const result = await strategy.challenge({ identifier: body.identifier, user_id: bearerUserId })
      return reply.code(202).send(result)
    },
  )
}

export default route
