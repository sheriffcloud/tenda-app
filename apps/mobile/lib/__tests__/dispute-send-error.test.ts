/**
 * classifyDisputeSendError / disputeSendMessage — the mapping that decides
 * whether a user is invited to retry.
 *
 * The bug this replaces was ONE toast for every refusal: an admin without the
 * claim, and anyone posting to a resolved thread, were told to "try again"
 * forever. So the assertions that matter are (a) each refusal is distinct and
 * (b) only `failed` says "try again".
 */
import { ErrorCode } from '@tenda/shared'
import { ApiClientError } from '@/api/client'
import {
  classifyDisputeSendError,
  disputeSendMessage,
  type DisputeSendFailure,
} from '@/lib/dispute-send-error'

/** Build the error the API layer actually throws, not a hand-rolled shape. */
const apiError = (statusCode: number, code?: string) =>
  new ApiClientError(statusCode, 'Error', 'server copy', code)

test('a resolved thread is its own reason, not a retry', () => {
  expect(classifyDisputeSendError(apiError(409, ErrorCode.DISPUTE_RESOLVED))).toBe('resolved')
})

test('a mediator without the claim is its own reason', () => {
  expect(classifyDisputeSendError(apiError(403, ErrorCode.FORBIDDEN))).toBe('not_claimed')
})

test('a rejected body is reported as invalid', () => {
  expect(classifyDisputeSendError(apiError(400, ErrorCode.VALIDATION_ERROR))).toBe('invalid')
})

test('the rate limiter is recognised by STATUS, having no ErrorCode', () => {
  // fastify-rate-limit answers outside the envelope, so a code-only match
  // would misfile a 429 as a generic failure and invite an instant retry.
  expect(classifyDisputeSendError(apiError(429))).toBe('rate_limited')
})

test('429 wins even when a code is present', () => {
  expect(classifyDisputeSendError(apiError(429, ErrorCode.VALIDATION_ERROR))).toBe('rate_limited')
})

test('an unrecognised API error is retryable, not silently mapped', () => {
  expect(classifyDisputeSendError(apiError(500, ErrorCode.INTERNAL_ERROR))).toBe('failed')
  expect(classifyDisputeSendError(apiError(404))).toBe('failed')
})

test('a network drop or a non-Error throw is retryable', () => {
  expect(classifyDisputeSendError(new TypeError('Network request failed'))).toBe('failed')
  expect(classifyDisputeSendError('nope')).toBe('failed')
  expect(classifyDisputeSendError(undefined)).toBe('failed')
})

test('ONLY the retryable failure invites another attempt', () => {
  const unretryable: DisputeSendFailure[] = ['resolved', 'not_claimed', 'invalid', 'rate_limited']
  for (const failure of unretryable) {
    expect(disputeSendMessage(failure, 'Message')).not.toMatch(/try again/i)
  }
  expect(disputeSendMessage('failed', 'Message')).toMatch(/try again/i)
})

test('every refusal reads differently, so none is mistaken for another', () => {
  const all: DisputeSendFailure[] = ['resolved', 'not_claimed', 'invalid', 'rate_limited', 'failed']
  const copies = all.map((f) => disputeSendMessage(f, 'Message'))
  expect(new Set(copies).size).toBe(all.length)
  expect(copies.every((c) => c.trim() !== '')).toBe(true)
})

test('the retryable copy names what failed; the rest are subject-agnostic', () => {
  expect(disputeSendMessage('failed', 'Message')).toBe('Message not sent, try again')
  expect(disputeSendMessage('failed', 'Attachment')).toBe('Attachment not sent, try again')
  // A resolved thread is about the thread, not about what you tried to post.
  expect(disputeSendMessage('resolved', 'Message')).toBe(disputeSendMessage('resolved', 'Attachment'))
})
