/**
 * #87, admin dashboard login provisioning (admin_users registry):
 *   PUT    /v1/admin/users/:id/login-email { email }, grant or rotate
 *   DELETE /v1/admin/users/:id/login-email          , revoke (idempotent)
 *
 * Guarded by users.assign_roles (super_admin): provisioning a login is
 * part of the admin lifecycle that permission already governs. Granting
 * is LOGIN only, never authority (schema/identity.ts invariant); the
 * target must ALREADY hold an admin role (grantAdminEmail refuses
 * otherwise). Demotion revokes the login inside the role-PATCH
 * transaction (users.ts); this DELETE is the manual path.
 */

import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { admin_users } from '@tenda/shared/db/schema/identity'
import { ErrorCode } from '@tenda/shared'
import type { ApiError } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { requirePermission } from '@server/lib/guards'
import { grantAdminEmail } from '@server/lib/admin-auth'
import { isUuidLike } from '@server/lib/uuid'
import { appEvents } from '@server/lib/events'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.put<{
    Params: { id: string }
    Body: { email?: unknown }
    Reply: { user_id: string; email: string; role: string } | ApiError
  }>(
    '/:id/login-email',
    { preHandler: [requirePermission('users.assign_roles')] },
    async (request) => {
      const email = request.body?.email
      if (typeof email !== 'string' || email === '') {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'email is required')
      }
      const granted = await grantAdminEmail(fastify.db, {
        user_id: request.params.id,
        email,
        added_by: request.user.id,
      })
      appEvents.emit('admin.grant_login_email', {
        adminId: request.user.id,
        adminRole: request.user.role,
        userId: granted.user_id,
        email: granted.email,
      })
      return granted
    },
  )

  fastify.delete<{
    Params: { id: string }
    Reply: { user_id: string; revoked: boolean } | ApiError
  }>(
    '/:id/login-email',
    { preHandler: [requirePermission('users.assign_roles')] },
    async (request) => {
      // Pre-validate like loadEscrowOr404 does, a junk id must 422, not
      // surface as a PG uuid-cast 500 (PUT gets this via grantAdminEmail).
      if (!isUuidLike(request.params.id)) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'id must be a UUID')
      }
      const deleted = await fastify.db
        .delete(admin_users)
        .where(eq(admin_users.user_id, request.params.id))
        .returning({ user_id: admin_users.user_id })
      const revoked = deleted.length > 0
      if (revoked) {
        appEvents.emit('admin.revoke_login_email', {
          adminId: request.user.id,
          adminRole: request.user.role,
          userId: request.params.id,
        })
      }
      return { user_id: request.params.id, revoked }
    },
  )
}

export default route
