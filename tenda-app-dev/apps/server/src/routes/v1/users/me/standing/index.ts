/**
 * GET /v1/users/me/standing, the authenticated user's own standing,
 * INCLUDING the active restriction (kind/until/reason). The public
 * /users/:id/standing deliberately never exposes these, soft cooldowns
 * stay private to the affected user (stage-7 § UX placements).
 */

import type { FastifyPluginAsync } from 'fastify'
import {
  activeRestriction,
  defaultRestrictionReason,
  toPublicStanding,
} from '@server/features/reputation/service'
import { drizzleReputationStore } from '@server/features/reputation/store'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const standing = await drizzleReputationStore(fastify.db).getStanding(request.user.id)
    const now = new Date()
    const summary = toPublicStanding(standing, now)
    const active = activeRestriction(standing, now)

    return {
      ...summary,
      restriction:
        active === null
          ? null
          : {
              kind: active.kind,
              until: active.until?.toISOString() ?? null,
              reason: active.reason ?? defaultRestrictionReason(active.kind),
            },
    }
  })
}

export default route
