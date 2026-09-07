/**
 * CORS policy (S5.5, closes open A3; reworked for the #90 dashboard, the
 * first real BROWSER consumer of this API):
 *   - Plugin level: CORS_ORIGIN list ∪ ADMIN_ORIGIN list (null CORS_ORIGIN
 *     = mirror any origin, dev only). The union matters: @fastify/cors is
 *     what answers preflights (allow-methods/allow-headers for the
 *     dashboard's PUT/PATCH/DELETE + Authorization), and the dashboard
 *     origin must also reach the /v1/auth/admin/* login routes, which sit
 *     OUTSIDE the admin prefix. Setting ADMIN_ORIGIN alone is sufficient.
 *   - /v1/admin/*: the hook below additionally scopes browser access to
 *     ADMIN_ORIGIN when it is set, app web origins can never call admin
 *     routes even though they pass the plugin. This closes the
 *     XSS-exfiltration path for a leaked admin JWT. ADMIN_ORIGIN unset =
 *     dev allow-all (matching the documented dev semantics); non-browser
 *     clients send no Origin header and rely on JWT auth alone.
 *
 * This is the SINGLE admin-origin enforcement point, routes/v1/admin/
 * index.ts deliberately has no origin hook of its own.
 */

import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { ErrorCode } from '@tenda/shared'
import { getConfig } from '@server/config'

const ADMIN_PREFIX = '/v1/admin/'

export default fp(async (fastify) => {
  const { CORS_ORIGIN, ADMIN_ORIGIN } = getConfig()

  fastify.register(cors, {
    origin:
      CORS_ORIGIN === null
        ? true
        : [...new Set([...CORS_ORIGIN, ...(ADMIN_ORIGIN ?? [])])],
    // @fastify/cors defaults to GET,HEAD,POST, the dashboard's PATCH/PUT/
    // DELETE preflights (takedown, role changes, config) need the rest.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })

  // Admin surface: enforce the origin allow-list before any handler runs.
  // @fastify/cors answers preflights (and sets allow-origin on responses);
  // this hook only decides whether a browser origin may use admin routes.
  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith(ADMIN_PREFIX)) return
    if (ADMIN_ORIGIN === null) return // dev: allow-all (documented semantics)
    const origin = request.headers.origin
    if (origin === undefined) return // non-browser client, JWT auth still applies
    if (ADMIN_ORIGIN.includes(origin)) return
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'admin routes are not available from this origin',
      code: ErrorCode.FORBIDDEN,
    })
  })
})
