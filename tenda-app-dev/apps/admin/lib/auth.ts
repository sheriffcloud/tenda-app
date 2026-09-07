/**
 * Admin auth state (#90) — bearer token in localStorage, sent via the
 * Authorization header by lib/api.ts. There is deliberately NO cookie and
 * NO Edge middleware (open_issues A5 / user decision 2026-06-05): the API
 * server is the only JWT verifier; the dashboard guard is client-side
 * (components/layout/auth-guard.tsx) and merely improves UX — every API
 * call is independently authorized server-side.
 */

const TOKEN_KEY = 'tenda_admin_token'
/** Exported for lib/use-session.ts — one source for the storage key. */
export const USER_KEY = 'tenda_admin_user'

/** Profile returned by POST /v1/auth/admin/verify-email-otp. */
export interface AdminSessionUser {
  id: string
  role: string
  first_name: string
  last_name: string
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getSessionUser(): AdminSessionUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as AdminSessionUser
  } catch {
    return null
  }
}

export function setSession(token: string, user: AdminSessionUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
