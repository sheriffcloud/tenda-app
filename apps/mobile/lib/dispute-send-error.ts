/**
 * Why a dispute-thread post was refused, and what to tell the user.
 *
 * The thread route rejects for four distinct reasons and only ONE of them is
 * worth retrying, so a single "try again" toast actively misleads: an admin
 * without the claim, or a resolved thread, will never succeed no matter how
 * many times they tap. Classification lives here rather than in the screen so
 * the codes are compared against the shared `ErrorCode` constants exactly once
 * (mirrors lib/connect-wallet-error.ts).
 */
import { ErrorCode } from '@tenda/shared'
import { ApiClientError } from '@/api/client'

/** Refusal reasons. `failed` is the only transient one. */
export type DisputeSendFailure = 'resolved' | 'not_claimed' | 'invalid' | 'rate_limited' | 'failed'

/** `sent` plus every way it can go wrong — what `send()` reports back. */
export type DisputeSendResult = 'sent' | DisputeSendFailure

/** HTTP 429; the rate limiter answers outside the ErrorCode envelope. */
const RATE_LIMITED_STATUS = 429

/**
 * Map a thrown send error to its reason. Anything unrecognised — a network
 * drop, a 500, a non-Error throw — is `failed`, the retryable bucket.
 */
export function classifyDisputeSendError(error: unknown): DisputeSendFailure {
  if (!(error instanceof ApiClientError)) return 'failed'
  if (error.statusCode === RATE_LIMITED_STATUS) return 'rate_limited'
  switch (error.code) {
    case ErrorCode.DISPUTE_RESOLVED:
      return 'resolved'
    case ErrorCode.FORBIDDEN:
      return 'not_claimed'
    case ErrorCode.VALIDATION_ERROR:
      return 'invalid'
    default:
      return 'failed'
  }
}

/** What the user is told. Only `failed` invites another attempt. */
const FAILURE_COPY: Readonly<Record<Exclude<DisputeSendFailure, 'failed'>, string>> = {
  resolved: 'This dispute is resolved, the thread is now read-only.',
  not_claimed: 'Claim this dispute in the admin dashboard before replying.',
  // The composer blocks empty sends (ChatInput's canSend), so the only 400
  // reachable from the UI is an over-length body — hence "shorten", which is
  // actionable, rather than "try again", which would repeat the same failure.
  invalid: 'That message is too long, shorten it and send again.',
  rate_limited: 'Too many messages just now, wait a moment before sending again.',
}

/** What the caller was trying to post, so the retryable copy names it. */
export type DisputeSendSubject = 'Message' | 'Attachment'

export function disputeSendMessage(
  failure: DisputeSendFailure,
  subject: DisputeSendSubject,
): string {
  return failure === 'failed' ? `${subject} not sent, try again` : FAILURE_COPY[failure]
}
