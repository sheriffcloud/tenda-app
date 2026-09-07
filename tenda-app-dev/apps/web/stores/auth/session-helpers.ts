/**
 * Pure helpers for auth.store — split out to keep the store within the file
 * budget; they carry no store state of their own.
 */
import { ApiClientError, ErrorCode, type IdentityMethodWire, type LinkedWallet } from '@tenda/shared'
import { clearAuthStorage } from '@/lib/storage'

/**
 * A wallets[] load failure worth retrying: transient network/5xx blips, not a
 * terminal auth failure (401/403 means re-authenticate, not hammer a dead
 * token). Mobile's isRetriableMeError, same predicate.
 */
export function isRetriableMeError(error: unknown): boolean {
  if (error instanceof ApiClientError) return error.statusCode !== 401 && error.statusCode !== 403
  return true
}

/**
 * A SIGN-IN call answered 401 UNAUTHORIZED — only the server's JWT guard
 * mints that code, so a dead stored token leaked onto the request. A 401 with
 * any other code (a wrong OTP) is the reader's own mistake, not a stale
 * session.
 */
export function isStaleSessionError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    error.statusCode === 401 &&
    error.code === ErrorCode.UNAUTHORIZED
  )
}

/**
 * Purge a stale bearer so the very next attempt starts clean (mobile's
 * purgeIfStaleSession). The store hands in its own signed-out write rather
 * than being imported here — the helpers stay free of the store.
 */
export async function purgeIfStaleSession(error: unknown, markSignedOut: () => void): Promise<void> {
  if (!isStaleSessionError(error)) return
  await clearAuthStorage()
  markSignedOut()
}

/**
 * The signed-out slice, applied by logout, a failed bootstrap, and
 * `stores/auth/cross-tab.ts` when another tab drops the token. Both load
 * lifecycles return to `idle`: the next account has asked for nothing.
 */
export const SIGNED_OUT = {
  user: null,
  jwt: null,
  isAuthenticated: false,
  profileComplete: null,
  identities: [] as IdentityMethodWire[],
  identitiesStatus: 'idle' as const,
  wallets: [] as LinkedWallet[],
  walletsStatus: 'idle' as const,
}
