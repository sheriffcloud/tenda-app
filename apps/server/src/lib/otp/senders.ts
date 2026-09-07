/**
 * OTP delivery transports (one `OtpSender` per channel). SMS has two providers
 *, Termii (regional) + Twilio (global), composed by destination prefix; email
 * rides the shared Resend transport; console is the dev fallback. The OTP code
 * lifecycle (hash, rate-limit, expiry) lives in the service, NOT the transport,
 * so e.g. Twilio is Programmable SMS, not Twilio Verify.
 */

import type { OtpChannel } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { sendViaResend, type ResendConfig } from '@server/lib/email'

export interface OtpSender {
  send(identifier: string, code: string): Promise<void>
}

/** The verification SMS body, single source for every SMS transport. */
export function otpSmsText(code: string): string {
  return `Your Tenda verification code is ${code}. Expires in 10 minutes.`
}

export const TERMII_SMS_URL = 'https://v3.api.termii.com/api/sms/send'

/**
 * Abort budget for SMS provider calls, same convention as the other outbound
 * transports (email RESEND_TIMEOUT_MS, push 15s). Without it a hung provider
 * holds a send-otp worker slot for undici's multi-minute default.
 */
export const SMS_SEND_TIMEOUT_MS = 15_000

/** Termii SMS, regional (api.ng.termii.com is NG/Africa-only). */
export function termiiSender(args: { api_key: string; sender_id: string }): OtpSender {
  return {
    async send(identifier, code) {
      const res = await fetch(TERMII_SMS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(SMS_SEND_TIMEOUT_MS),
        body: JSON.stringify({
          api_key: args.api_key,
          to: identifier,
          from: args.sender_id,
          sms: otpSmsText(code),
          type: 'plain',
          channel: 'generic',
        }),
      })
      if (!res.ok) {
        throw new AppError(
          502,
          ErrorCode.INTERNAL_ERROR,
          `Termii send failed with status ${res.status}`,
        )
      }
    },
  }
}

export const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01'

/**
 * Twilio Programmable SMS (the `/Messages` API), global delivery. We keep our
 * own code lifecycle (auth_otps store + hash + rate-limit + expiry), so Twilio
 * is a transport here, NOT Twilio Verify (which would own the code and fork our
 * channel-agnostic OTP model). `from` is EITHER an E.164 sender number OR a
 * Messaging Service SID (`MG…`, the recommended production sender), they go in
 * different request params, so we route by prefix. Auth is HTTP Basic
 * (AccountSid:AuthToken).
 */
export function twilioSmsSender(args: {
  account_sid: string
  auth_token: string
  from: string
}): OtpSender {
  // A Messaging Service SID must be sent as `MessagingServiceSid`; an E.164
  // number as `From`. Twilio rejects an `MG…` SID passed as `From` (err 21212).
  const senderParam = args.from.startsWith('MG') ? 'MessagingServiceSid' : 'From'
  return {
    async send(identifier, code) {
      const url = `${TWILIO_API_BASE}/Accounts/${args.account_sid}/Messages.json`
      const credentials = Buffer.from(`${args.account_sid}:${args.auth_token}`).toString('base64')
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: AbortSignal.timeout(SMS_SEND_TIMEOUT_MS),
        body: new URLSearchParams({ To: identifier, [senderParam]: args.from, Body: otpSmsText(code) }).toString(),
      })
      if (!res.ok) {
        throw new AppError(
          502,
          ErrorCode.INTERNAL_ERROR,
          `Twilio send failed with status ${res.status}`,
        )
      }
    },
  }
}

/** One routing rule: a number whose E.164 starts with any of `prefixes` → `sender`. */
export interface SmsRoute {
  prefixes: string[]
  sender: OtpSender
}

/**
 * Compose SMS transports by destination prefix: a number matching a rule's
 * prefix goes to that sender, everything else to `fallback`. Lets a regional
 * provider (Termii for +234) coexist with a global one (Twilio) behind the
 * single per-channel sender the OTP store expects, routing happens per number
 * at send-time, so the rule set stays config-driven (no hardcoded geography).
 */
export function routedSmsSender(routes: SmsRoute[], fallback: OtpSender): OtpSender {
  return {
    async send(identifier, code) {
      const route = routes.find((r) => r.prefixes.some((p) => identifier.startsWith(p)))
      await (route?.sender ?? fallback).send(identifier, code)
    },
  }
}

/**
 * Pick the phone SMS transport from the configured providers (pure, the
 * candidates are pre-built so this stays unit-testable, decoupled from config):
 *   • both → route `prefixes` to Termii (cheaper locally), rest to Twilio.
 *   • one  → that provider for all numbers.
 *   • none → the dev `fallback` (console).
 */
export function composePhoneSender(opts: {
  termii: OtpSender | null
  twilio: OtpSender | null
  prefixes: string[]
  fallback: OtpSender
}): OtpSender {
  if (opts.termii !== null && opts.twilio !== null) {
    return routedSmsSender([{ prefixes: opts.prefixes, sender: opts.termii }], opts.twilio)
  }
  return opts.twilio ?? opts.termii ?? opts.fallback
}

/** Email OTP delivery via the shared Resend transport (consumer copy). */
export function emailOtpSender(cfg: ResendConfig): OtpSender {
  return {
    async send(identifier, code) {
      await sendViaResend(cfg, {
        to: identifier,
        subject: 'Your Tenda verification code',
        text: `Your Tenda verification code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.`,
      })
    },
  }
}

/** Development interim (provider key unset): code lands in the server log. */
export function consoleSender(
  log: { warn(obj: object, msg: string): void },
  channel: OtpChannel = 'phone',
): OtpSender {
  return {
    async send(identifier, code) {
      log.warn(
        { channel, identifier, code },
        `${channel} OTP provider unset, code logged, not sent`,
      )
    },
  }
}
