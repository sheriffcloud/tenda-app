/**
 * Web replacement for apps/mobile/lib/secure-store.ts — same surface, backed
 * by localStorage (master-plan decision #5: bearer JWT in localStorage, like
 * apps/admin; the standard XSS tradeoff is accepted and documented there).
 *
 * SSR-safe by construction: the API client imports this module and the API
 * client is imported by server components, so every call must NO-OP on the
 * server (return null) rather than throw. The async signatures are kept so
 * ported mobile code (api/request.ts, stores/auth.store.ts) works unchanged.
 */
/** Exported for the cross-tab `storage`-event listener (auth store). */
export const JWT_TOKEN_KEY = 'jwt_token'
const WALLET_ADDRESS_KEY = 'wallet_address'

function readItem(key: string): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(key)
}

function writeItem(key: string, value: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value)
}

function removeItem(key: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(key)
}

export async function getJwtToken(): Promise<string | null> {
  return readItem(JWT_TOKEN_KEY)
}

export async function setJwtToken(token: string): Promise<void> {
  writeItem(JWT_TOKEN_KEY, token)
}

export async function deleteJwtToken(): Promise<void> {
  removeItem(JWT_TOKEN_KEY)
}

export async function getWalletAddress(): Promise<string | null> {
  return readItem(WALLET_ADDRESS_KEY)
}

export async function setWalletAddress(address: string): Promise<void> {
  writeItem(WALLET_ADDRESS_KEY, address)
}

export async function deleteWalletAddress(): Promise<void> {
  removeItem(WALLET_ADDRESS_KEY)
}

export async function clearAuthStorage(): Promise<void> {
  await Promise.all([deleteJwtToken(), deleteWalletAddress()])
}
