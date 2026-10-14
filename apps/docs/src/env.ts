/**
 * Which deployment this build points at.
 *
 * The document itself is baked in at build time and needs no server. This is
 * the ORIGIN every documented path hangs off — what the page shows a reader so
 * they know where to send a request, and where the Run console sends its own.
 * Read from the environment the same way the landing reads its own, so a docs
 * build for staging and one for production differ by a variable rather than by
 * a code change.
 *
 * The fallback is the local server: a contributor running `pnpm dev` with no
 * env file gets a console pointed at their own API rather than at production.
 * `configured` says which of the two happened, because the page now PRINTS
 * this value — and a deployed page quietly telling every reader the API is at
 * localhost is a worse failure than one that says it was never told.
 */
const LOCAL_API = 'http://localhost:3000'

/**
 * The name of the one variable this build reads, for the page to say when it
 * is missing.
 *
 * A separate constant rather than the key of the read below, which stays a
 * static property access — that is the form Vite replaces at build time.
 * `env.test.ts` reads the variable THROUGH this constant, so the two cannot
 * drift without the suite noticing.
 */
export const API_BASE_URL_VAR = 'VITE_API_BASE_URL'

export interface ApiBase {
  /** The origin every documented path hangs off, without a trailing slash. */
  url: string
  /** False where nothing was configured and the local fallback stands. */
  configured: boolean
}

export function apiBase(env: ImportMetaEnv = import.meta.env): ApiBase {
  const configured = env.VITE_API_BASE_URL
  return typeof configured === 'string' && configured.length > 0
    ? { url: configured.replace(/\/+$/, ''), configured: true }
    : { url: LOCAL_API, configured: false }
}

/** The URL alone, for the callers that only ever need to build one. */
export const apiBaseUrl = (env: ImportMetaEnv = import.meta.env): string => apiBase(env).url
