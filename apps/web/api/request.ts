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
import { ApiClientError, type ApiError, type QueryParams,
  SESSION_CLIENT_HEADER,
} from '@tenda/shared'
// Web deviation from the mobile original (see lib/api-config.ts): the base
// URL must be resolved in app code for Next's env inlining to reach it.
import { apiConfig } from '@/lib/config/api-config'
import { getJwtToken } from '@/lib/storage'
import { getEnv } from '@/lib/config/env'


/** This app's session stamp (#53c-1). The app sends 'mobile'. */
const WEB_CLIENT = 'web'

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

  // WHICH client is talking (#53c-1). Web stamps itself honestly rather than
  // sending nothing: the gas-seed claim is app-only, and a session that says
  // 'web' gets told to claim in the app instead of being refused for a reason
  // the page cannot explain.
  headers[SESSION_CLIENT_HEADER] = WEB_CLIENT

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
      throw new ApiClientError(error.statusCode, error.error, error.message, error.code, error.details)
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
