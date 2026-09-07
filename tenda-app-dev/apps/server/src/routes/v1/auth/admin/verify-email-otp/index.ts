/**
 * POST /v1/auth/admin/verify-email-otp, finish an admin-dashboard login (#86).
 *
 * Body: { email, code } → { token, expires_in, user }. The JWT payload is
 * the same { id, role } every other surface uses (auth plugin + statusCache
 * work unchanged); only the lifetime differs, ADMIN_JWT_EXPIRES_IN (12h
 * default), never the mobile 7d. Role + status are re-checked at verify
 * time inside verifyAdminLoginOtp; failures are a uniform 401 OTP_INVALID
 * (no admin-email oracle), with OTP_EXPIRED only for the correct code.
 */

import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { ErrorCode } from '@tenda/shared'
import { users } from '@tenda/shared/db/schema/identity'
import { AppError } from '@server/lib/errors'
import { getConfig } from '@server/config'
import { verifyAdminLoginOtp } from '@server/lib/admin-otp'

interface Body {
  email?: unknown
  code?: unknown
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Body }>(
    '/',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const { email, code } = request.body ?? {}
      if (typeof email !== 'string' || email === '' || typeof code !== 'string' || code === '') {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'email and code are required')
      }

      const admin = await verifyAdminLoginOtp(
        { db: fastify.db, now: () => new Date() },
        { email, code },
      )

      // `token_ttl` (a duration string, e.g. '12h'), deliberately NOT
      // `expires_in`, which the send route uses for the CODE lifetime in
      // seconds; same-named fields with different units would be a trap.
      const expiresIn = getConfig().ADMIN_JWT_EXPIRES_IN
      const token = fastify.jwt.sign({ id: admin.user_id, role: admin.role }, { expiresIn })

      const [profile] = await fastify.db
        .select({
          id: users.id,
          role: users.role,
          first_name: users.first_name,
          last_name: users.last_name,
        })
        .from(users)
        .where(eq(users.id, admin.user_id))
        .limit(1)

      return { token, token_ttl: expiresIn, user: profile }
    },
  )
}

export default route
