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
  /**
   * Origin of the Tenda web app (apps/web), linked from the navbar. Env-driven
   * rather than a constant in @/content because it differs per deployment:
   * production points at the production app, Vercel previews at the dev app.
   * Vite inlines this at BUILD time, so each deployment must be built with its
   * own value — a Vercel Preview build cannot inherit Production's.
   */
  webAppUrl: required('VITE_WEB_APP_URL', import.meta.env.VITE_WEB_APP_URL),
} as const

export type Env = typeof ENV
