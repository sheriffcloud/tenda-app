/**
 * Tier-0 classification of /auth/verify failures + the user-facing message
 * mapping (ported from mobile at the move; now narrows the REAL shared
 * ApiClientError, which is the point of moving the class).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiClientError } from '../../src/api/client-error'
import { classifyVerifyError, TIER0_MESSAGE, verifyErrorMessage } from '../../src/utils/auth-flow'

const FALLBACK = 'Something went wrong, please try again'

test('classifyVerifyError: maps the two Tier-0 codes', () => {
  assert.equal(classifyVerifyError(new ApiClientError(404, 'x', 'm', 'WALLET_NOT_LINKED')), 'wallet_not_linked')
  assert.equal(
    classifyVerifyError(new ApiClientError(409, 'x', 'm', 'IDENTITY_ALREADY_LINKED')),
    'identity_already_linked',
  )
})

test('classifyVerifyError: null for other codes and non-API errors', () => {
  assert.equal(classifyVerifyError(new ApiClientError(401, 'x', 'm', 'OTP_INVALID')), null)
  assert.equal(classifyVerifyError(new ApiClientError(500, 'x', 'm')), null)
  assert.equal(classifyVerifyError(new Error('boom')), null)
  assert.equal(classifyVerifyError(null), null)
})

test('TIER0_MESSAGE: user-facing copy for every reason', () => {
  assert.match(TIER0_MESSAGE.wallet_not_linked, /wallet/i)
  assert.match(TIER0_MESSAGE.identity_already_linked, /another account/i)
})

test('verifyErrorMessage: prefers Tier-0 copy', () => {
  const e = new ApiClientError(404, 'Not Found', 'wallet not linked', 'WALLET_NOT_LINKED')
  assert.equal(verifyErrorMessage(e, FALLBACK), TIER0_MESSAGE.wallet_not_linked)
})

test("verifyErrorMessage: replaces the JWT guard's raw 401 envelope with friendly retry copy", () => {
  const e = new ApiClientError(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
  const msg = verifyErrorMessage(e, FALLBACK)
  assert.doesNotMatch(msg, /invalid or missing token/i)
  assert.match(msg, /try again/i)
})

test('verifyErrorMessage: surfaces the server message for other API errors', () => {
  const e = new ApiClientError(401, 'Unauthorized', 'Invalid or expired code', 'OTP_INVALID')
  assert.equal(verifyErrorMessage(e, FALLBACK), 'Invalid or expired code')
})

test('verifyErrorMessage: caller fallback for non-API errors', () => {
  assert.equal(verifyErrorMessage(new TypeError('Network request failed'), FALLBACK), FALLBACK)
  assert.equal(verifyErrorMessage(null, FALLBACK), FALLBACK)
})

test('ApiClientError: carries the envelope fields', () => {
  const e = new ApiClientError(429, 'Too Many Requests', 'slow down', 'OTP_RATE_LIMITED')
  assert.equal(e.name, 'ApiClientError')
  assert.equal(e.statusCode, 429)
  assert.equal(e.error, 'Too Many Requests')
  assert.equal(e.message, 'slow down')
  assert.equal(e.code, 'OTP_RATE_LIMITED')
  assert.ok(e instanceof Error)
})
