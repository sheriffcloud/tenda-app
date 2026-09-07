/**
 * Admin email-OTP test helpers (#86/#88) — issue codes through the real
 * lib service with a capturing sender, so tests hold a verifiable code
 * without going through a mail provider.
 */
import assert from 'node:assert'
import type { FastifyInstance } from 'fastify'
import { sendAdminLoginOtp, type AdminOtpDeps } from '../../src/lib/admin-otp'

/** Issue a code via the lib with a capturing sender; returns the code. */
export async function issueAdminCode(
  app: FastifyInstance,
  email: string,
  at?: Date,
): Promise<string> {
  let captured = ''
  const deps: AdminOtpDeps = {
    db: app.db,
    sender: {
      async send(_to, code) {
        captured = code
      },
    },
    now: () => at ?? new Date(),
  }
  await sendAdminLoginOtp(deps, { email })
  assert.notStrictEqual(captured, '', 'expected a code to be issued')
  return captured
}
