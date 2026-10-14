/**
 * HTTP core for the typed API client: env-aware base URL, JWT header,
 * timeout via AbortController, and the ApiError envelope → ApiClientError
 * mapping. Endpoint groups live in ./client.
 */
// `QueryParams` is SHARED, not redeclared here: it is the constraint every
// `*Query` type in @tenda/shared is compile-checked against (see
// assertQueryShape), and a second local copy could drift from the one the
// server's types actually satisfy — which is how the `as Record<string,
// unknown>` casts got in.
import {
  apiConfig,
  ApiClientError,
  SESSION_CLIENT_HEADER,
  type ApiError,
  type QueryParams,
} from '@tenda/shared'
import { getJwtToken } from '@/lib/secure-store'
import { getEnv } from '@/lib/env'

/** This app's session stamp (#53c-1). Web sends 'web'; older builds send none. */
const MOBILE_CLIENT = 'mobile'

const REQUEST_TIMEOUT_MESSAGE =
  'The server is taking longer than expected. Please check whether the action completed before retrying.'

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'name' in error && error.name === 'AbortError'
}

function buildUrl(
  base: string,
  path: string,
  params?: Record<string, string>,
  query?: QueryParams,
): string {
  let url = `${base}${path}`

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`:${key}`, encodeURIComponent(value))
    }
  }

  if (query) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value))
      }
    }
    const qs = searchParams.toString()
    if (qs) url += `?${qs}`
  }

  return url
}

export async function request<TResponse>(
  method: string,
  path: string,
  options?: {
    params?: Record<string, string>
    body?: unknown
    query?: QueryParams
    /**
     * false → force an anonymous call: no Authorization header even when a JWT
     * is stored. Sign-in surfaces need this, the server treats a present
     * bearer on /v1/auth/{challenge,verify} as link intent and hard-401s a
     * stale one, which would poison every retry until storage is cleared.
     */
    auth?: boolean
    /**
     * Per-request timeout override (ms). Defaults to `apiConfig[env].timeout`.
     * Endpoints that synchronously run the moderation LLM (gig create,
     * moderation preview) need a budget above the server's worst-case LLM
     * latency — the global dev 5s default aborts mid-moderation, surfacing as
     * a raw "Aborted" before the wallet ever opens.
     */
    timeout?: number
  },
): Promise<TResponse> {
  const env = getEnv()
  const config = apiConfig[env]
  const url = buildUrl(config.baseUrl, path, options?.params, options?.query)
  const token = options?.auth === false ? null : await getJwtToken()
  const headers: Record<string, string> = {}

  if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  // WHICH client is talking (#53c-1). Sent on every request rather than only at
  // sign-in: the server reads it where a session is MINTED, and there is more
  // than one such route (/auth/verify, /agent/register) — a per-route opt-in is
  // how one of them silently stops stamping. It is a claim, not a proof, and
  // nothing security-bearing rests on it alone.
  headers[SESSION_CLIENT_HEADER] = MOBILE_CLIENT

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  let deadlineExpired = false
  const timeoutId = setTimeout(() => {
    deadlineExpired = true
    controller.abort()
  }, options?.timeout ?? config.timeout)

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })

    if (!response.ok) {
      const error: ApiError = await response.json()
      // `details` rides through. The server sends it (http-errors serializes
      // it whenever an AppError carries one) and the SHARED `ApiClientError`
      // declares it, so dropping it here was this transport quietly discarding
      // contract data that web's transport keeps. What reads it today is
      // `requiredWalletOf` — the ESCROW_WRONG_WALLET `required_address` that
      // names the wallet an escrow is bound to; a refusal without it is a
      // message the reader cannot act on.
      throw new ApiClientError(
        error.statusCode,
        error.error,
        error.message,
        error.code,
        error.details,
      )
    }

    return (await response.json()) as TResponse
  } catch (error) {
    if (deadlineExpired && isAbortError(error)) {
      throw new ApiClientError(408, 'Request Timeout', REQUEST_TIMEOUT_MESSAGE, 'REQUEST_TIMEOUT')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
