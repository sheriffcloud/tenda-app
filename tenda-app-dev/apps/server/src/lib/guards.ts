import type { FastifyRequest, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import type { Permission, UserRole } from '@tenda/shared'
import { ErrorCode, hasCompleteName, hasPermission } from '@tenda/shared'
import { users } from '@tenda/shared/db/schema/identity'
import { AppError } from '@server/lib/errors'
import { isUuidLike } from '@server/lib/uuid'

// hasPermission moved to @tenda/shared (#90) so the admin dashboard's nav
// filter and the server guards share one implementation. Re-exported here,
// existing `from '@server/lib/guards'` imports stay valid.
export { hasPermission }

/**
 * The caller's id on a route guarded by `optionalAuthenticate` or
 * `identifyViewer`, or null when they are anonymous.
 *
 * Keyed on the decoration, NOT on the Authorization header. Under
 * `identifyViewer` an unreadable bearer leaves the header present and the
 * caller anonymous, so a header check would report a user that does not exist
 * and read `.id` off undefined.
 */
export function optionalUserId(request: FastifyRequest): string | null {
  // `request.user` is typed non-optional by the @fastify/jwt augmentation, but
  // it is only ASSIGNED by a successful jwtVerify — hence the widened read
  // rather than a cast.
  const user: FastifyRequest['user'] | undefined = request.user
  return user?.id ?? null
}

/**
 * Fastify preHandler that enforces one of the given roles.
 * Always use after fastify.authenticate in the preHandler chain:
 *   { preHandler: [fastify.authenticate, requireRole('super_admin', 'dispute_admin')] }
 */
export function requireRole(...roles: UserRole[]) {
  const effective = new Set<string>(roles)

  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!effective.has(request.user.role)) {
      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Insufficient permissions',
        code: ErrorCode.FORBIDDEN,
      })
    }
  }
}

/**
 * Fastify preHandler enforcing a single permission from the shared
 * PERMISSIONS map. Prefer this over requireRole for every admin route,
 * granting a future role is then a map edit in @tenda/shared, not a route
 * sweep. Always use after fastify.authenticate:
 *   { preHandler: [fastify.authenticate, requirePermission('users.suspend')] }
 */
export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!hasPermission(request.user.role, permission)) {
      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Insufficient permissions',
        code: ErrorCode.FORBIDDEN,
      })
    }
  }
}

/**
 * Fastify preHandler enforcing a completed profile (stage-1: first_name AND
 * last_name set) before posting or accepting work. Reads the users row per
 * request rather than trusting the auth status cache: profile fields change via
 * PATCH /users/me and must take effect immediately.
 *
 * SEVEN routes carry it, counted from the compiler rather than from memory —
 * this docstring said four until #108: POST /v1/escrows, the escrow
 * accept / decline / assign / unassign / build-create transitions, and gig
 * applications.
 *
 * THE TWO ARMS ANSWER DIFFERENTLY (#117), because they are different facts. A
 * blank name is "finish signing up" — 403, the session is fine. A MISSING ROW is
 * "this account is gone", which makes the SESSION invalid, not the profile: 401,
 * the same answer `authenticate`'s cold path, GET /v1/users/me and
 * escrows/index.ts already give for exactly this state. Until #117 both left by
 * the 403 door, so a deleted account was told to complete its profile — safe,
 * being fail-closed, but it sent the holder and whoever picked up their support
 * ticket to look at the wrong thing.
 *
 * The missing-row arm is only reachable while `authenticate`'s status cache is
 * WARM: cold, that hook has already answered 401 from the same absence. So this
 * arm exists for the window after an admin deletes a live session's account —
 * up to STATUS_CACHE_TTL_MS — and its job is to give the same answer the cold
 * path would.
 */
export async function requireProfileComplete(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const rows = await request.server.db
    .select({ first_name: users.first_name, last_name: users.last_name })
    .from(users)
    .where(eq(users.id, request.user.id))
    .limit(1)
  const row = rows[0]
  if (row === undefined) {
    return reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'User no longer exists',
      code: ErrorCode.UNAUTHORIZED,
    })
  }
  // `hasCompleteName`, not `=== ''`: two spaces are not a name, and this guard
  // is the one that matters most of the three that used to test it that way —
  // it clears a user to POST and ACCEPT work, so a whitespace row could trade
  // while every surface showed the counterparty "Anonymous".
  if (!hasCompleteName(row.first_name, row.last_name)) {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Complete your profile before posting or accepting work',
      code: ErrorCode.PROFILE_INCOMPLETE,
    })
  }
}

/**
 * Fastify preHandler that 404s a malformed `:id` before it reaches the driver.
 *
 * Every id column in the schema is postgres `uuid`, which rejects malformed
 * input with `invalid input syntax for type uuid`. Unguarded that surfaces as
 * a 500 — the caller is told the server fell over when their id was simply not
 * an id. 404 rather than 400 matches the unknown-id answer these routes
 * already give, and the precedent in gigs/_id/applications.
 *
 * Registered as a plugin-level hook rather than per route, because the failure
 * mode is a handler FORGETTING the guard: one registration covers every `:id`
 * route in the scope, including ones added later. Register it inside the
 * plugin, never on the parent router, so the authenticate hook still runs
 * first and a stranger gets 401 rather than a 404. *
 * `code` defaults to NOT_FOUND but takes the route's own vocabulary where it
 * has one (USER_NOT_FOUND), so a malformed id answers exactly as an unknown
 * one does rather than inventing a second shape for the same outcome.
 *
 * `param` defaults to 'id'. It exists because /v1/admin/standing/:user_id
 * names its param differently, and a guard hard-coded to `id` would sit on
 * that route doing nothing at all — worse than being absent, because the
 * registration reads as if it were covered.
 */
export function uuidParamGuard(
  notFoundMessage: string,
  options: { code?: ErrorCode | string; param?: string } = {},
) {
  const { code = ErrorCode.NOT_FOUND, param = 'id' } = options
  return async function guard(
    request: FastifyRequest<{ Params: Record<string, string | undefined> }>,
  ): Promise<void> {
    const value = request.params[param]
    if (value !== undefined && !isUuidLike(value)) {
      throw new AppError(404, code, notFoundMessage)
    }
  }
}
