/**
 * POST /v1/agent/demo-session — a bearer for the shared demo agent (#108).
 *
 * No body, no proof, no auth: this is the one door a reviewer with no wallet
 * can walk through, and it exists because every round-one reviewer met a 401
 * here instead. Answers the same `{ token, user, is_new }` a registration does,
 * so nothing downstream knows or cares that the session came from here.
 *
 * Rate-limited per IP, at 30/min: LOOSER than the registration beside it (10),
 * TIGHTER than the platform default (100 — plugins/rate-limit.ts). Looser than
 * registration because eight of the ten round-one reviewers were one operator's
 * fleet, and a strict per-IP limit would starve the very audience this serves,
 * while one call per reviewer leaves the ceiling far away. Tighter than the
 * default because the endpoint needs no credential at all, so it is the
 * cheapest thing on this server to hammer — though the damage is bounded
 * anyway: one indexed read, one token signature, and an account that can spend
 * nothing.
 */
import type { FastifyPluginAsync } from 'fastify'
import { ErrorCode, type AgentRegisterResponse } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { mintAuthResponse, sessionClientFromHeaders } from '@server/features/auth/session/session'
import { demoAgentSession } from '@server/features/agent/demo/demoSession'
import { DEMO_SCOPE } from '@server/features/auth/session/scope'

const route: FastifyPluginAsync = async (fastify) => {
  /**
   * An EMPTY body under `content-type: application/json` is the documented
   * call, not a malformed request.
   *
   * Fastify's default JSON parser refuses it with FST_ERR_CTP_EMPTY_JSON_BODY
   * before any handler runs, and most HTTP clients — and every agent framework
   * wrapping one — set that header whether or not they send anything. MEASURED:
   * 200 with no content-type, 400 with it. A reader who follows the document
   * ("no body") and lets their client set its usual header would meet a 400 at
   * the one door built to stop exactly that.
   *
   * Scoped to THIS plugin: autoload registers each route file unwrapped, so the
   * override cannot loosen JSON parsing for any other route. A body that is
   * present but malformed still fails, because it is still `JSON.parse`.
   */
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      if (body === '') return done(null, {})
      try {
        done(null, JSON.parse(body as string) as unknown)
      } catch {
        // The app's own 400, not the raw SyntaxError: handing that back lands
        // in the catch-all and answers 500 — measured — which would report a
        // caller's typo as a server fault.
        done(new AppError(400, ErrorCode.VALIDATION_ERROR, 'body must be JSON, or absent'), undefined)
      }
    },
  )

  fastify.post<{ Reply: AgentRegisterResponse }>(
    '/',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const { user, isNew } = await demoAgentSession(fastify)
      // SCOPED, and this is the only mint site that passes one. The account on
      // the end of this token is shared and free to obtain, so the token reaches
      // only the routes the document offers it — see `DEMO_SCOPE_ROUTES` for
      // which those are and why, what it costs the demo (nothing) and what it
      // stops (a keyless read of every gated route, measured on production).
      return {
        ...mintAuthResponse(fastify, user, sessionClientFromHeaders(request.headers), DEMO_SCOPE),
        is_new: isNew,
      }
    },
  )
}

export default route
