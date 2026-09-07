/**
 * GET /v1/admin/metrics, active-user counts off users.last_active_at
 * (S5.8; the lazy ≤1/hour update already lives in plugins/auth.ts).
 */

import type { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { users } from '@tenda/shared/db/schema'
import { requirePermission } from '@server/lib/guards'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate, requirePermission('metrics.read')] },
    async () => {
      const [row] = await fastify.db
        .select({
          total_users: sql<number>`count(*)::int`,
          active_24h: sql<number>`count(*) filter (where ${users.last_active_at} > now() - interval '24 hours')::int`,
          active_7d: sql<number>`count(*) filter (where ${users.last_active_at} > now() - interval '7 days')::int`,
          active_30d: sql<number>`count(*) filter (where ${users.last_active_at} > now() - interval '30 days')::int`,
          suspended: sql<number>`count(*) filter (where ${users.status} = 'suspended')::int`,
        })
        .from(users)
      return { metrics: row }
    },
  )
}

export default route
