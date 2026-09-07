import { FastifyPluginAsync } from 'fastify'
import { clampLimit, clampOffset } from '@server/lib/pagination'
import { containsPattern } from '@server/lib/like-pattern'
import { eq, exists, ilike, or, and, desc, isNull, sql, SQL } from 'drizzle-orm'
import { users, user_wallets, disputes, admin_users } from '@tenda/shared/db/schema'
import {
  ADMIN_ROLES, ASSIGNABLE_ROLES, ErrorCode,
} from '@tenda/shared'
import { hasPermission, requirePermission, uuidParamGuard } from '@server/lib/guards'
import { computeDisputeRate } from '@server/features/reputation/fraud-flag'
import { AppError, requireBody } from '@server/lib/errors'
import { ensureTxUpdated } from '@server/lib/db'
import { appEvents } from '@server/lib/events'
import type { ApiError, UserRole, UserStatus } from '@tenda/shared'


const adminUsers: FastifyPluginAsync = async (fastify) => {
  // Malformed id reaches postgres as a uuid comparison and throws; answer
  // it the way an unknown id already is.
  fastify.addHook('preHandler', uuidParamGuard('User not found', { code: ErrorCode.USER_NOT_FOUND }))

  // GET /v1/admin/users, list users (super_admin only post-#34: the
  // legacy role zoo collapsed to dispute_admin + super_admin)
  fastify.get<{
    Querystring: { status?: string; role?: string; search?: string; limit?: number; offset?: number }
    Reply: { data: unknown[]; total: number; limit: number; offset: number } | ApiError
  }>('/', { 
    preHandler: [requirePermission('users.read')] 
  }, async (request) => {
    const { status, role, search, limit = 20, offset = 0 } = request.query
    const safeLimit  = clampLimit(Number(limit))
    const safeOffset = clampOffset(Number(offset))

    const conditions: SQL[] = []

    if (status === 'active' || status === 'suspended') {
      conditions.push(eq(users.status, status as UserStatus))
    }

    if (role) {
      if (!ASSIGNABLE_ROLES.includes(role as UserRole)) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, `Invalid role filter`)
      }
      conditions.push(eq(users.role, role as UserRole))
    }

    if (search && search.trim().length > 0) {
      // Escaped, so the term is matched as TEXT: `%`, `_` and `\` are pattern
      // syntax to postgres even in a bound parameter, and an operator pasting an
      // address fragment or a name containing one used to get a wider list with
      // nothing to say why (#119). Not a security fix — the value never reaches
      // SQL text — a correctness one.
      const pattern = containsPattern(search.trim())
      // Wallets are multi-row in v2, so match any linked address — correlated
      // to its owner, which admin-user-list.test.ts pins in both directions.
      //
      // THIS IS A SEQ SCAN over user_wallets, ON PURPOSE, and the note that
      // used to sit here claimed otherwise: it said the text_pattern_ops index
      // covered the search. That index served LIKE 'abc%', and this pattern is
      // neither prefix-only nor case-sensitive. MEASURED on 3k rows with fresh
      // statistics (docs/query_plan_measurements.md): LIKE 'SoWabc%' → Index
      // Only Scan, ILIKE '%abc%' → Seq Scan, and even ILIKE 'SoWabc%' → Seq
      // Scan.
      //
      // #118 resolved it by DROPPING that index (migration 0030) rather than by
      // narrowing this search, so do not go looking for it. The scan is the
      // price of letting an operator paste a fragment from the MIDDLE of an
      // address, which is what they actually have when a user reads one out;
      // a prefix index cannot serve that at any opclass. If this table ever
      // grows enough to matter, the fix is a pg_trgm index, not a narrower
      // match — the reasoning is in #118 and in the schema comment on
      // user_wallets.
      conditions.push(
        or(
          ilike(users.first_name, pattern),
          ilike(users.last_name, pattern),
          exists(
            fastify.db
              .select({ one: sql`1` })
              .from(user_wallets)
              .where(and(eq(user_wallets.user_id, users.id), ilike(user_wallets.address, pattern))),
          ),
        )!,
      )
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [data, countResult] = await Promise.all([
      fastify.db
        .select({
          id:               users.id,
          first_name:       users.first_name,
          last_name:        users.last_name,
          role:             users.role,
          status:           users.status,
          is_seeker:        users.is_seeker,
          country:          users.country,
          city:             users.city,
          review_score:     users.review_score,
          created_at:       users.created_at,
          last_active_at:   users.last_active_at,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.created_at))
        .limit(safeLimit)
        .offset(safeOffset),
      fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(where),
    ])

    return { data, total: countResult[0].count, limit: safeLimit, offset: safeOffset }
  })

  // GET /v1/admin/users/:id, full user detail (same PII restriction as list)
  fastify.get<{
    Params: { id: string }
    Reply: unknown | ApiError
  }>('/:id', { 
    preHandler: [requirePermission('users.read')] 
  }, async (request) => {
    const { id } = request.params

    const [user] = await fastify.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)

    if (!user) throw new AppError(404, ErrorCode.USER_NOT_FOUND, 'User not found')

    // #82: live dispute-rate metric, FLAG only, never auto-restricts.
    const dispute_metric = await computeDisputeRate(fastify.db, id)

    return { ...user, dispute_metric }
  })

  // PATCH /v1/admin/users/:id/status, suspend or reinstate (role: support, moderator, super_admin)
  fastify.patch<{
    Params: { id: string }
    Body:   { status: 'active' | 'suspended' }
    Reply:  { id: string; status: string } | ApiError
  }>('/:id/status', { preHandler: [requirePermission('users.suspend')] }, async (request) => {
    const { id } = request.params
    const { status } = requireBody(request.body)

    if (status !== 'active' && status !== 'suspended') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'status must be "active" or "suspended"')
    }

    const [target] = await fastify.db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)

    if (!target) throw new AppError(404, ErrorCode.USER_NOT_FOUND, 'User not found')

    if (ADMIN_ROLES.includes(target.role as typeof ADMIN_ROLES[number]) && status === 'suspended') {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Cannot suspend another admin account')
    }

    const [updated] = await fastify.db
      .update(users)
      .set({ status, updated_at: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id, status: users.status })

    const result = ensureTxUpdated(updated, 'User not found')

    appEvents.emit(
      status === 'suspended' ? 'admin.suspend_user' : 'admin.reinstate_user',
      { adminId: request.user.id, adminRole: request.user.role, userId: id, previousStatus: target.status },
    )

    return result
  })

  // PATCH /v1/admin/users/:id/role, promote or demote a user
  fastify.patch<{
    Params: { id: string }
    Body:   { role: UserRole }
    Reply:  { id: string; role: string } | ApiError
  }>('/:id/role', { 
    preHandler: [requirePermission('users.assign_roles')] 
  }, async (request) => {
    const { id } = request.params
    const { role } = requireBody(request.body)

    if (!ASSIGNABLE_ROLES.includes(role)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, `role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`)
    }

    if (id === request.user.id && role === 'user') {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Cannot demote your own account')
    }

    const [current] = await fastify.db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)

    if (!current) throw new AppError(404, ErrorCode.USER_NOT_FOUND, 'User not found')

    // Role change + caseload release + login revoke land together or not
    // at all (A15 + #87). Two DISTINCT triggers, on purpose:
    //   - dispute release is permission-driven (new role lacks
    //     disputes.mediate) so adding roles to the map never breaks it;
    //     resolved disputes keep their assignee for audit history.
    //   - login revoke is role-CLASS driven (new role is non-admin = no
    //     dashboard at all); a dispute_admin keeps their login.
    const { updated, releasedDisputes, revokedLogin } = await fastify.db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({ role, updated_at: new Date() })
        .where(eq(users.id, id))
        .returning({ id: users.id, role: users.role })

      let released: { id: string }[] = []
      if (!hasPermission(role, 'disputes.mediate')) {
        released = await tx
          .update(disputes)
          .set({ assigned_to: null, assigned_at: null })
          .where(and(eq(disputes.assigned_to, id), isNull(disputes.resolved_at)))
          .returning({ id: disputes.id })
      }

      let revoked: { user_id: string }[] = []
      if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
        revoked = await tx
          .delete(admin_users)
          .where(eq(admin_users.user_id, id))
          .returning({ user_id: admin_users.user_id })
      }
      return { updated: row, releasedDisputes: released.length, revokedLogin: revoked.length > 0 }
    })

    const result = ensureTxUpdated(updated, 'User not found')

    appEvents.emit('admin.change_role', {
      adminId:      request.user.id,
      adminRole:    request.user.role,
      userId:       id,
      previousRole: current.role,
      newRole:      role,
      releasedDisputes,
      revokedLogin,
    })

    return result
  })
}

export default adminUsers
