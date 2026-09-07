/**
 * Google Sign-In wrapper (Stage 9C). Opens the native sheet and returns the
 * id_token; the server verifies it (POST /v1/auth/verify, method 'google').
 * Error codes are mapped to a clean reason set the UI can branch on.
 */

import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin'

export class GoogleSignInError extends Error {
  readonly reason:
    | 'cancelled'
    | 'in_progress'
    | 'play_services_unavailable'
    | 'developer_error'
    | 'no_id_token'
    | 'unknown'
  constructor(reason: GoogleSignInError['reason'], message: string) {
    super(message)
    this.name = 'GoogleSignInError'
    this.reason = reason
  }
}

/** Configure the native SDK once at app startup (before any signIn). */
export function configureGoogleSignIn(iosClientId?: string, webClientId?: string): void {
  // iOS uses iosClientId; Android resolves the client id from the SHA-1 in
  // Google Cloud Console; web uses webClientId (also the server-verified `aud`).
  GoogleSignin.configure({ iosClientId, webClientId })
}

/** Open the Google sheet and return the id_token. Throws GoogleSignInError. */
export async function signInWithGoogle(): Promise<string> {
  try {
    await GoogleSignin.hasPlayServices()
    const response = await GoogleSignin.signIn()
    if (!isSuccessResponse(response)) {
      throw new GoogleSignInError('cancelled', 'Google sign-in was cancelled')
    }
    const { idToken } = response.data
    if (!idToken) {
      throw new GoogleSignInError('no_id_token', 'No ID token returned by Google')
    }
    return idToken
  } catch (err) {
    if (err instanceof GoogleSignInError) throw err
    if (isErrorWithCode(err)) {
      // Android emits DEVELOPER_ERROR (Play Services code 10) when the running
      // build's package + signing SHA-1 + client IDs don't match an OAuth client
      // in Google Cloud Console — the classic "works in local build, fails in the
      // EAS build" cause (different signing key). It has no named statusCodes
      // constant, so match the raw code/message. Surfaced distinctly so the UI
      // can say "configuration" instead of a useless "something went wrong".
      const code = String(err.code)
      if (code === 'DEVELOPER_ERROR' || code === '10' || /DEVELOPER_ERROR/i.test(err.message)) {
        throw new GoogleSignInError(
          'developer_error',
          `Google sign-in configuration error (DEVELOPER_ERROR): the app's package name / signing SHA-1 / client IDs don't match an OAuth client in Google Cloud Console. ${err.message}`,
        )
      }
      switch (err.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          throw new GoogleSignInError('cancelled', 'Google sign-in was cancelled')
        case statusCodes.IN_PROGRESS:
          throw new GoogleSignInError('in_progress', 'A sign-in is already in progress')
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          throw new GoogleSignInError(
            'play_services_unavailable',
            'Google Play Services not available on this device',
          )
        default:
          throw new GoogleSignInError('unknown', err.message || 'Google sign-in failed')
      }
    }
    throw new GoogleSignInError('unknown', err instanceof Error ? err.message : 'Google sign-in failed')
  }
}

/** Clear the native Google sign-in state. Idempotent; failures are non-fatal. */
export async function signOutFromGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut()
  } catch {
    // The user is logging out anyway.
  }
}
