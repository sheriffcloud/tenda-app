/**
 * Mint the auth response (JWT + user) for the unified /auth/verify route, one
 * place that enforces the suspended gate and signs the id+role token (no
 * wallet/PII in the claims, cutover §11).
 */

import type { AuthResponse, User } from '@tenda/shared'
import { DEMO_TOKEN_EXPIRES_IN, ErrorCode, SESSION_CLIENT_HEADER, parseSessionClient } from '@tenda/shared'
import type { SessionClient } from '@tenda/shared'
import type { IncomingHttpHeaders } from 'node:http'
import { AppError } from '@server/lib/errors'
import { getConfig } from '@server/config'
import type { TokenScope } from '@server/features/auth/session/scope'

/**
 * What minting actually needs from the app: something that signs.
 *
 * Narrow rather than `FastifyInstance`, matching `OtpSenderHost` one directory
 * over — a real instance satisfies it structurally, so no call site changes,
 * and a test can assert on the CLAIMS without standing up a server. Signing is
 * the whole of this module's contact with Fastify.
 */
export interface TokenSigner {
  jwt: { sign(payload: object, options: { expiresIn: string }): string }
}

/**
 * @param client Which client is minting this session, from the request's
 *   `x-tenda-client` header. Null for web, for API callers, and for app builds
 *   that predate the stamp — all of which must keep working, so the claim is
 *   carried when present and simply omitted when not.
 *
 *   It is recorded as a property of the SESSION, deliberately generic: useful
 *   for audit and support, and readable by any surface that is legitimately
 *   app-only. Nothing here knows what reads it, which is what keeps a feature
 *   that does out of this file.
 *
 *   NOT a security boundary on its own — a caller can send any header. Surfaces
 *   that care pair it with facts a caller cannot assert (a registered device, a
 *   verified phone). See shared constants/session.ts.
 *
 * @param scope Restricts what the token may reach (`features/auth/session/scope.ts`). Passed
 *   ONLY by the demo session; every other mint site omits it and the token is
 *   unrestricted, which is what keeps a real agent's session a full one.
 *
 *   A scoped token also gets its OWN lifetime, `DEMO_TOKEN_EXPIRES_IN`, which
 *   is SHARED because the published document states it in words. Both facts
 *   travel together because they answer one question: how much this particular
 *   bearer is trusted.
 */
export function mintAuthResponse(
  fastify: TokenSigner,
  user: User,
  client: SessionClient | null = null,
  scope: TokenScope | null = null,
): AuthResponse {
  if (user.status === 'suspended') {
    throw new AppError(403, ErrorCode.USER_SUSPENDED, 'account suspended')
  }
  const token = fastify.jwt.sign(
    {
      id: user.id,
      role: user.role,
      ...(client !== null ? { client } : {}),
      ...(scope !== null ? { scope } : {}),
    },
    { expiresIn: scope !== null ? DEMO_TOKEN_EXPIRES_IN : getConfig().JWT_EXPIRES_IN },
  )
  return { token, user }
}

/**
 * The client stamp on an inbound request, or null.
 *
 * One helper rather than the same two lines at each mint site: Node hands back
 * `string[]` for a repeated header, and a site that forgot to unwrap it would
 * silently stamp nothing — the failure mode that looks like the feature simply
 * not working. First value wins; a caller sending the header twice has already
 * left the well-formed case.
 */
export function sessionClientFromHeaders(headers: IncomingHttpHeaders): SessionClient | null {
  const raw = headers[SESSION_CLIENT_HEADER]
  return parseSessionClient(Array.isArray(raw) ? raw[0] : raw)
}
