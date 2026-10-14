/**
 * Low-level transactional email transport (Resend). Shared by the admin
 * login OTP (#86) and the Stage 9 consumer email-OTP channel so the HTTP
 * call + error mapping live in exactly one place. Higher layers supply the
 * subject/body; this module only knows how to deliver.
 */

import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

export const RESEND_API_URL = 'https://api.resend.com/emails'

/** Timeout for the outbound Resend call, fail fast, do not hang a request. */
export const RESEND_TIMEOUT_MS = 15_000

export interface EmailMessage {
  to: string
  subject: string
  text: string
}

export interface ResendConfig {
  api_key: string
  from: string
}

/** POST a single email via Resend. Throws 502 on a non-2xx response. */
export async function sendViaResend(cfg: ResendConfig, msg: EmailMessage): Promise<void> {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: cfg.from, to: [msg.to], subject: msg.subject, text: msg.text }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new AppError(502, ErrorCode.INTERNAL_ERROR, `Resend send failed with status ${res.status}`)
  }
}
