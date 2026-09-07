/**
 * Typed env reader. Throws at boot if a required var is missing so misconfiguration
 * fails loud in dev/staging instead of producing a silent broken landing page.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

export const ENV = {
  apiBaseUrl: required('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
} as const

export type Env = typeof ENV
