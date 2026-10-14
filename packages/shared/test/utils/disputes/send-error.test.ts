/**
 * classifyDisputeSendError / disputeSendMessage — the mapping that decides
 * whether a user is invited to retry.
 *
 * The bug this replaces was ONE toast for every refusal: an admin without the
 * claim, and anyone posting to a resolved thread, were told to "try again"
 * forever. So the assertions that matter are (a) each refusal is distinct and
 * (b) only `failed` says "try again".
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { ErrorCode } from '../../../src/constants/errors'
import { ApiClientError } from '../../../src/api/client-error'
import {
  classifyDisputeSendError,
  disputeSendMessage,
  type DisputeSendFailure,
} from '../../../src/utils/disputes/send-error'

/** Build the error the API layer actually throws, not a hand-rolled shape. */
const apiError = (statusCode: number, code?: string) =>
  new ApiClientError(statusCode, 'Error', 'server copy', code)

test('a resolved thread is its own reason, not a retry', () => {
  assert.strictEqual(classifyDisputeSendError(apiError(409, ErrorCode.DISPUTE_RESOLVED)), 'resolved')
})

test('a mediator without the claim is its own reason', () => {
  assert.strictEqual(classifyDisputeSendError(apiError(403, ErrorCode.FORBIDDEN)), 'not_claimed')
})

test('a rejected body is reported as invalid', () => {
  assert.strictEqual(classifyDisputeSendError(apiError(400, ErrorCode.VALIDATION_ERROR)), 'invalid')
})

test('the rate limiter is recognised by STATUS, having no ErrorCode', () => {
  // fastify-rate-limit answers outside the envelope, so a code-only match
  // would misfile a 429 as a generic failure and invite an instant retry.
  assert.strictEqual(classifyDisputeSendError(apiError(429)), 'rate_limited')
})

test('429 wins even when a code is present', () => {
  assert.strictEqual(classifyDisputeSendError(apiError(429, ErrorCode.VALIDATION_ERROR)), 'rate_limited')
})

test('an unrecognised API error is retryable, not silently mapped', () => {
  assert.strictEqual(classifyDisputeSendError(apiError(500, ErrorCode.INTERNAL_ERROR)), 'failed')
  assert.strictEqual(classifyDisputeSendError(apiError(404)), 'failed')
})

test('a network drop or a non-Error throw is retryable', () => {
  assert.strictEqual(classifyDisputeSendError(new TypeError('Network request failed')), 'failed')
  assert.strictEqual(classifyDisputeSendError('nope'), 'failed')
  assert.strictEqual(classifyDisputeSendError(undefined), 'failed')
})

test('ONLY the retryable failure invites another attempt', () => {
  const unretryable: DisputeSendFailure[] = ['resolved', 'not_claimed', 'invalid', 'rate_limited']
  for (const failure of unretryable) {
    assert.doesNotMatch(disputeSendMessage(failure, 'Message'), /try again/i)
  }
  assert.match(disputeSendMessage('failed', 'Message'), /try again/i)
})

test('every refusal reads differently, so none is mistaken for another', () => {
  const all: DisputeSendFailure[] = ['resolved', 'not_claimed', 'invalid', 'rate_limited', 'failed']
  const copies = all.map((f) => disputeSendMessage(f, 'Message'))
  assert.strictEqual(new Set(copies).size, all.length)
  assert.ok(copies.every((c) => c.trim() !== ''))
})

test('the retryable copy names what failed; the rest are subject-agnostic', () => {
  assert.strictEqual(disputeSendMessage('failed', 'Message'), 'Message not sent, try again')
  assert.strictEqual(disputeSendMessage('failed', 'Attachment'), 'Attachment not sent, try again')
  // A resolved thread is about the thread, not about what you tried to post.
  assert.strictEqual(
    disputeSendMessage('resolved', 'Message'),
    disputeSendMessage('resolved', 'Attachment'),
  )
})
