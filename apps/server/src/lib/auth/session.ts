/**
 * Mint the auth response (JWT + user) for the unified /auth/verify route, one
 * place that enforces the suspended gate and signs the id+role token (no
 * wallet/PII in the claims, cutover §11).
 */

import type { FastifyInstance } from 'fastify'
import type { AuthResponse, User } from '@tenda/shared'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { getConfig } from '@server/config'

export function mintAuthResponse(fastify: FastifyInstance, user: User): AuthResponse {
  if (user.status === 'suspended') {
    throw new AppError(403, ErrorCode.USER_SUSPENDED, 'account suspended')
  }
  const token = fastify.jwt.sign(
    { id: user.id, role: user.role },
    { expiresIn: getConfig().JWT_EXPIRES_IN },
  )
  return { token, user }
}
