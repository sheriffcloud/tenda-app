/**
 * OTP-based auth strategy (phone + email), one factory for both channels;
 * they differ only in identifier normalisation and which sender fires. Wraps
 * the channel-agnostic lib/otp service.
 */

import { isE164, normalizeEmail } from '@tenda/shared'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { sendOtp, verifyOtp, type OtpChannel, type OtpDeps } from '@server/lib/otp'
import type { AuthStrategy, ChallengeOutcome, VerifyOutcome, VerifyProof } from '@server/lib/auth/strategy'

/** Normalise an identifier for the channel; null when malformed. */
function normalizeIdentifier(channel: OtpChannel, raw: string): string | null {
  return channel === 'email' ? normalizeEmail(raw) : isE164(raw) ? raw : null
}

export function otpStrategy(channel: OtpChannel, deps: OtpDeps): AuthStrategy {
  return {
    method: channel,
    async challenge({ identifier, user_id }): Promise<ChallengeOutcome> {
      const normalized = normalizeIdentifier(channel, identifier)
      if (normalized === null) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, `invalid ${channel} identifier`)
      }
      return sendOtp(deps, { channel, identifier: normalized, user_id })
    },
    async verify(proof: VerifyProof): Promise<VerifyOutcome> {
      if (proof.method !== 'phone' && proof.method !== 'email') {
        throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'otp strategy received a non-otp proof')
      }
      const normalized = normalizeIdentifier(channel, proof.identifier)
      if (normalized === null) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, `invalid ${channel} identifier`)
      }
      await verifyOtp(deps, {
        channel,
        identifier: normalized,
        code: proof.code,
        user_id: proof.user_id,
      })
      return {
        type: 'identity',
        identity: {
          kind: channel,
          identifier: normalized,
          // A verified email carries itself as the contact address; phone does not.
          email: channel === 'email' ? normalized : null,
        },
      }
    },
  }
}
