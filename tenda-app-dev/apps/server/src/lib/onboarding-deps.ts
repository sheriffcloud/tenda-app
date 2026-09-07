/**
 * Dependency builders for the OTP half of the Stage-1 onboarding routes. One
 * place wires config → concrete senders so the routes stay declarative and the
 * #32 interim (console OTP) is encoded once.
 *
 * The gas-seed trigger used to live here too; it moved to
 * `features/gas-seed/trigger.ts` when the seed became a self-contained,
 * removable feature. Nothing about OTP delivery depends on it.
 */

import type { FastifyInstance } from 'fastify'
import { getConfig } from '@server/config'
import type { OtpChannel } from '@tenda/shared/db/schema'
import {
  composePhoneSender,
  consoleSender,
  drizzleOtpStore,
  emailOtpSender,
  otpDispatch,
  termiiSender,
  twilioSmsSender,
  type OtpDeps,
  type OtpSender,
} from '@server/lib/otp'

/**
 * What the sender builders actually need from the app: somewhere to log.
 *
 * Narrow on purpose, mirroring `consoleSender`'s own parameter and
 * `buildAdminEmailSender` one file over — both take the shape they use rather
 * than the whole instance. `buildOtpDeps` below still takes the FastifyInstance
 * because it genuinely reads `db` and `queue`; these two do not, and a wider
 * type here forces every caller (including tests) to conjure an instance or
 * cast through `unknown` to supply one.
 */
export interface OtpSenderHost {
  log: { warn(obj: object, msg: string): void }
}

/**
 * Pick the phone SMS transport: prefer cost-optimal routing (Termii for its
 * configured prefixes, Twilio for the global rest) when BOTH are set; else
 * whichever single provider is configured; else the dev console fallback.
 */
function buildPhoneSender(host: OtpSenderHost): OtpSender {
  const config = getConfig()
  const termii =
    config.TERMII_API_KEY !== null && config.TERMII_SENDER_ID !== null
      ? termiiSender({ api_key: config.TERMII_API_KEY, sender_id: config.TERMII_SENDER_ID })
      : null
  const twilio =
    config.TWILIO_ACCOUNT_SID !== null &&
    config.TWILIO_AUTH_TOKEN !== null &&
    config.TWILIO_SMS_FROM !== null
      ? twilioSmsSender({
          account_sid: config.TWILIO_ACCOUNT_SID,
          auth_token: config.TWILIO_AUTH_TOKEN,
          from: config.TWILIO_SMS_FROM,
        })
      : null

  return composePhoneSender({
    termii,
    twilio,
    prefixes: config.TERMII_COUNTRY_PREFIXES,
    fallback: consoleSender(host.log, 'phone'),
  })
}

/**
 * Resolve one concrete sender per channel from config (Resend/console for
 * email, Termii/Twilio/console for phone). Shared by the inline-dispatch
 * fallback here AND the `send-otp` worker processor, single source so the two
 * delivery paths can never drift.
 */
export function buildOtpSenders(host: OtpSenderHost): Record<OtpChannel, OtpSender> {
  const config = getConfig()
  const email: OtpSender =
    config.RESEND_API_KEY !== null && config.EMAIL_FROM !== null
      ? emailOtpSender({ api_key: config.RESEND_API_KEY, from: config.EMAIL_FROM })
      : consoleSender(host.log, 'email')
  return { phone: buildPhoneSender(host), email }
}

export function buildOtpDeps(fastify: FastifyInstance): OtpDeps {
  const { REDIS_URL } = getConfig()
  return {
    store: drizzleOtpStore(fastify.db),
    // With Redis, hand delivery to the queue so the request never blocks on the
    // provider; without it (dev / test harness) fall back to an inline send.
    dispatch: otpDispatch({
      enqueue:
        REDIS_URL !== null
          ? async (msg) => {
              await fastify.queue.enqueue('send-otp', msg, { remove_on_complete: true })
            }
          : null,
      inlineSenders: () => buildOtpSenders(fastify),
    }),
    now: () => new Date(),
  }
}
