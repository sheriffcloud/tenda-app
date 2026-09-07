/**
 * lib/auth-flow, Tier-0 classification of /auth/verify failures + the shared
 * user-facing message mapping (incl. never surfacing the JWT guard's raw
 * "Invalid or missing token" envelope).
 */

jest.mock('@/api/client', () => {
  // Mock class so the lib's `instanceof ApiClientError` resolves here too.
  class ApiClientError extends Error {
    statusCode: number
    code?: string
    constructor(statusCode: number, error: string, message: string, code?: string) {
      super(message)
      this.statusCode = statusCode
      this.code = code
    }
  }
  return { ApiClientError }
})

import { classifyVerifyError, verifyErrorMessage, TIER0_MESSAGE } from '@/lib/auth-flow'
import { ApiClientError } from '@/api/client'

describe('classifyVerifyError', () => {
  it('maps WALLET_NOT_LINKED + IDENTITY_ALREADY_LINKED to Tier-0 reasons', () => {
    expect(classifyVerifyError(new ApiClientError(404, 'x', 'm', 'WALLET_NOT_LINKED'))).toBe('wallet_not_linked')
    expect(classifyVerifyError(new ApiClientError(409, 'x', 'm', 'IDENTITY_ALREADY_LINKED'))).toBe(
      'identity_already_linked',
    )
  })

  it('returns null for other error codes and non-API errors', () => {
    expect(classifyVerifyError(new ApiClientError(401, 'x', 'm', 'OTP_INVALID'))).toBeNull()
    expect(classifyVerifyError(new ApiClientError(500, 'x', 'm'))).toBeNull() // no code
    expect(classifyVerifyError(new Error('boom'))).toBeNull()
    expect(classifyVerifyError(null)).toBeNull()
  })

  it('has user-facing copy for every Tier-0 reason', () => {
    expect(TIER0_MESSAGE.wallet_not_linked).toMatch(/wallet/i)
    expect(TIER0_MESSAGE.identity_already_linked).toMatch(/another account/i)
  })
})

describe('verifyErrorMessage', () => {
  const FALLBACK = 'Something went wrong, please try again'

  it('prefers Tier-0 copy when the code maps to a Tier-0 reason', () => {
    const e = new ApiClientError(404, 'Not Found', 'wallet not linked', 'WALLET_NOT_LINKED')
    expect(verifyErrorMessage(e, FALLBACK)).toBe(TIER0_MESSAGE.wallet_not_linked)
  })

  it('replaces the JWT guard\'s raw 401 envelope with friendly retry copy', () => {
    const e = new ApiClientError(401, 'Unauthorized', 'Invalid or missing token', 'UNAUTHORIZED')
    const msg = verifyErrorMessage(e, FALLBACK)
    expect(msg).not.toMatch(/invalid or missing token/i)
    expect(msg).toMatch(/try again/i)
  })

  it('surfaces the server message for other API errors', () => {
    const e = new ApiClientError(401, 'Unauthorized', 'Invalid or expired code', 'OTP_INVALID')
    expect(verifyErrorMessage(e, FALLBACK)).toBe('Invalid or expired code')
  })

  it('uses the caller fallback for non-API errors', () => {
    expect(verifyErrorMessage(new TypeError('Network request failed'), FALLBACK)).toBe(FALLBACK)
    expect(verifyErrorMessage(null, FALLBACK)).toBe(FALLBACK)
  })
})
