import fp from 'fastify-plugin'
import fjwt from '@fastify/jwt'
import { eq } from 'drizzle-orm'
import { FastifyReply, FastifyRequest } from 'fastify'
import { users } from '@tenda/shared/db/schema'
import type { UserRole } from '@tenda/shared'
import { ErrorCode } from '@tenda/shared'
import { getConfig } from '@server/config'

// Augmentations live in `src/types/fastify.d.ts`.

// In-process cache of user status + role keyed by user ID.
// Avoids a DB round-trip on every authenticated request while still
// propagating suspensions and role changes within a short window.
const STATUS_CACHE_TTL_MS   = 60_000      // 1 minute
const STATUS_CACHE_SWEEP_MS = 5 * 60_000  // sweep every 5 minutes
const LAST_ACTIVE_UPDATE_INTERVAL_MS = 60 * 60_000 // write last_active_at at most once per hour
const statusCache = new Map<string, { status: string; role: string; expiresAt: number }>()

// Evict expired entries out-of-band so the sweep never runs in the request path.
// Without this the Map would grow until the process restarts in long-running production deployments.
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of statusCache.entries()) {
    if (now > v.expiresAt) statusCache.delete(k)
  }
}, STATUS_CACHE_SWEEP_MS).unref() // .unref() so the timer doesn't keep the process alive during tests

export default fp(async (fastify) => {
  fastify.register(fjwt, { secret: getConfig().JWT_SECRET })

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid or missing token',
        code: ErrorCode.UNAUTHORIZED,
      })
    }

    // Check if the user is suspended. Use the in-process cache to avoid
    // a DB query on every request, cache misses fall back to the DB.
    const userId = request.user.id
    const now = Date.now()
    let cached = statusCache.get(userId)

    if (!cached || now > cached.expiresAt) {
      const [row] = await fastify.db
        .select({ status: users.status, role: users.role, last_active_at: users.last_active_at })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (!row) {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'User no longer exists',
          code: ErrorCode.UNAUTHORIZED,
        })
      }

      cached = { status: row.status, role: row.role, expiresAt: now + STATUS_CACHE_TTL_MS }
      statusCache.set(userId, cached)

      // Lazy-update last_active_at at most once per hour to avoid write amplification.
      const lastActive = row.last_active_at?.getTime() ?? 0
      if (now - lastActive > LAST_ACTIVE_UPDATE_INTERVAL_MS) {
        void fastify.db
          .update(users)
          .set({ last_active_at: new Date(now) })
          .where(eq(users.id, userId))
          .catch((err) => fastify.log.warn({ err, userId }, 'last_active_at update failed'))
      }
    }

    // Override the JWT role with the DB-refreshed value so demotions take effect
    // within the cache TTL (60 s) rather than waiting for token expiry (7 days).
    request.user.role = cached.role as UserRole

    if (cached.status === 'suspended') {
      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Account suspended',
        code: ErrorCode.USER_SUSPENDED,
      })
    }
  })

  // Optional auth (Stage 9 unified /auth routes): no Authorization header →
  // proceed anonymously (login/create). Header present → it MUST be valid +
  // not suspended (delegates to `authenticate`), so a stale token can't be
  // silently treated as a fresh sign-up.
  fastify.decorate('optionalAuthenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.headers.authorization === undefined) return
    return fastify.authenticate(request, reply)
  })

  /**
   * LENIENT identification for PUBLIC read routes whose response is merely
   * richer when it knows who is asking (the gig detail's `viewer` block).
   *
   * Deliberately not `optionalAuthenticate`. That one hard-401s an unusable
   * bearer, which is right on /auth/{challenge,verify} — a stale token there
   * must never be mistaken for a fresh sign-up. On a public page it would turn
   * an expired session into "Failed to load gig" for anyone opening a shared
   * link or a push deep-link, breaking a route that has always been readable
   * by anybody.
   *
   * No suspension check, and none is needed: nothing reachable through this
   * decorator is an action. Every write re-runs the full `authenticate`.
   */
  fastify.decorate('identifyViewer', async (request: FastifyRequest) => {
    if (request.headers.authorization === undefined) return
    try {
      await request.jwtVerify()
    } catch {
      // Unreadable bearer → anonymous, exactly as if none had been sent.
    }
  })
})
