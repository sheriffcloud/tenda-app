/**
 * Apple Sign-In wrapper (Stage 9C). Opens the native sheet and returns the
 * id_token (+ the first-time full name, which Apple sends ONCE per client).
 * The server verifies the token (POST /v1/auth/verify, method 'apple').
 */

import * as AppleAuthentication from 'expo-apple-authentication'

export class AppleSignInError extends Error {
  readonly reason: 'cancelled' | 'unavailable' | 'no_id_token' | 'unknown'
  constructor(reason: AppleSignInError['reason'], message: string) {
    super(message)
    this.name = 'AppleSignInError'
    this.reason = reason
  }
}

export interface AppleSignInResult {
  idToken: string
  /**
   * Apple includes the name ONLY on the FIRST sign-in for a client, use it to
   * prefill profile setup. Later sign-ins return null and it can't be retrieved.
   */
  fullName: string | null
}

/** Whether to show the "Continue with Apple" button (iOS 13+; App Store 4.8). */
export async function isAppleAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync()
  } catch {
    return false
  }
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  let credential: AppleAuthentication.AppleAuthenticationCredential
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })
  } catch (err) {
    const code = typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined
    if (code === 'ERR_REQUEST_CANCELED') {
      throw new AppleSignInError('cancelled', 'Apple sign-in was cancelled')
    }
    if (code === 'ERR_APPLE_AUTHENTICATION_UNAVAILABLE') {
      throw new AppleSignInError('unavailable', 'Sign In with Apple is not available on this device')
    }
    throw new AppleSignInError('unknown', err instanceof Error ? err.message : 'Apple sign-in failed')
  }

  if (!credential.identityToken) {
    throw new AppleSignInError('no_id_token', 'No identity token returned by Apple')
  }
  return { idToken: credential.identityToken, fullName: composeFullName(credential.fullName) }
}

function composeFullName(
  name: AppleAuthentication.AppleAuthenticationCredential['fullName'],
): string | null {
  if (!name) return null
  const parts = [name.givenName, name.familyName].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  )
  return parts.length > 0 ? parts.join(' ') : null
}
