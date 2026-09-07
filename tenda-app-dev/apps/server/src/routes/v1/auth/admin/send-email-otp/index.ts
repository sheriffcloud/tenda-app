/**
 * POST /v1/auth/admin/send-email-otp, start an admin-dashboard login (#86).
 *
 * Body: { email }. Answers 200 UNCONDITIONALLY (anti-enumeration): a code
 * goes out only when the email belongs to an ACTIVE admin via admin_users,
 * but unknown emails, demoted/suspended accounts, and internally
 * rate-limited sends all look identical from outside. The only non-200s
 * are 422 (missing email) and 503 (prod without a configured sender).
 */

import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { getConfig } from '@server/config'
import { resolveAdminEmailSender, sendAdminLoginOtp } from '@server/lib/admin-otp'
import { OTP_TTL_SECONDS } from '@server/lib/otp'

interface Body {
  email?: unknown
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Body }>(
    '/',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      const email = request.body?.email
      if (typeof email !== 'string' || email === '') {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'email is required')
      }
      // Sender availability is decided BEFORE any lookup, the 503 fires
      // for every request alike, so it carries no admin-email signal.
      const sender = resolveAdminEmailSender(getConfig(), fastify.log)
      await sendAdminLoginOtp(
        { db: fastify.db, sender, now: () => new Date() },
        { email },
        request.log,
      )
      return { sent: true, expires_in: OTP_TTL_SECONDS }
    },
  )
}

export default route
