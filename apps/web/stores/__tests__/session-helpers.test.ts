/**
 * stores/auth/session-helpers — the retry predicate the wallets[] loader
 * feeds to withRetry: transient failures retry, dead tokens surface at once.
 */
import { describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '@tenda/shared'
import { JWT_TOKEN_KEY } from '@/lib/storage'
import {
  isRetriableMeError,
  isStaleSessionError,
  purgeIfStaleSession,
} from '@/stores/auth/session-helpers'

describe('isRetriableMeError', () => {
  it('retries transient failures — network errors and 5xx', () => {
    expect(isRetriableMeError(new Error('fetch failed'))).toBe(true)
    expect(isRetriableMeError(new ApiClientError(503, 'Service Unavailable', 'down'))).toBe(true)
  })

  it('never retries a terminal auth failure (401/403 → re-authenticate)', () => {
    expect(isRetriableMeError(new ApiClientError(401, 'Unauthorized', 'dead token'))).toBe(false)
    expect(isRetriableMeError(new ApiClientError(403, 'Forbidden', 'forbidden'))).toBe(false)
  })
})

describe('isStaleSessionError', () => {
  it('is the JWT guard’s OWN 401 — code UNAUTHORIZED — and nothing else', () => {
    // Only the guard mints that code, so it means a dead stored token leaked
    // onto a sign-in call. A 401 with the OTP code is a wrong code, not a
    // stale session, and purging on it would sign out a reader mid-flow.
    expect(isStaleSessionError(new ApiClientError(401, 'Unauthorized', 'dead', 'UNAUTHORIZED'))).toBe(true)
    expect(isStaleSessionError(new ApiClientError(401, 'Unauthorized', 'wrong code', 'OTP_INVALID'))).toBe(false)
    expect(isStaleSessionError(new ApiClientError(403, 'Forbidden', 'no', 'UNAUTHORIZED'))).toBe(false)
    expect(isStaleSessionError(new Error('fetch failed'))).toBe(false)
  })
})

describe('purgeIfStaleSession', () => {
  it('clears the stored token and marks the session out ONLY for a stale bearer', async () => {
    const markSignedOut = vi.fn()
    window.localStorage.setItem(JWT_TOKEN_KEY, 'stale')
    await purgeIfStaleSession(new ApiClientError(401, 'Unauthorized', 'dead', 'UNAUTHORIZED'), markSignedOut)
    expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBeNull()
    expect(markSignedOut).toHaveBeenCalledOnce()

    window.localStorage.setItem(JWT_TOKEN_KEY, 'still-valid')
    await purgeIfStaleSession(new ApiClientError(401, 'Unauthorized', 'wrong code', 'OTP_INVALID'), markSignedOut)
    expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBe('still-valid')
    expect(markSignedOut).toHaveBeenCalledOnce()
  })
})
