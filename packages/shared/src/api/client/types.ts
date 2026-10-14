/**
 * The transport seam the endpoint modules are written against.
 *
 * Everything in this folder DESCRIBES endpoints — a verb, a route constant and
 * a payload shape — and nothing performs I/O. The performing half is each
 * client's own `request`, which differs for real reasons: web resolves its
 * base URL through app code so Next inlines it, and reads the JWT from
 * localStorage; mobile takes the base URL from shared config and reads the JWT
 * from expo-secure-store. Injecting it is what lets the descriptions live once
 * without dragging either platform's storage into this package.
 *
 * The shape is the intersection of what both clients' `request` already
 * accepted, verbatim — this is not a new contract, it is the existing one
 * written down.
 */
import type { QueryParams } from '../../types/api'

export interface ApiRequestOptions {
  params?: Record<string, string>
  body?: unknown
  query?: QueryParams
  /**
   * false → force an anonymous call: no Authorization header even when a JWT
   * is stored. The server treats a present bearer on
   * /v1/auth/{challenge,verify} as LINK intent and hard-401s a stale one.
   */
  auth?: boolean
  /** Per-request timeout override (ms). Defaults to the client's own budget. */
  timeout?: number
}

export type ApiRequest = <TResponse>(
  method: string,
  path: string,
  options?: ApiRequestOptions,
) => Promise<TResponse>
