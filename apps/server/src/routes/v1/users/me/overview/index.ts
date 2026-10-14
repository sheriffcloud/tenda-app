/**
 * GET /v1/users/me/overview, the dashboard's counts in one round trip
 * (replaces ~5 list calls read off `total`). DB facts only — balances live on
 * the chain and stay client-read. See features/profile/overview.ts.
 */

import type { FastifyPluginAsync } from 'fastify'
import { readMyOverview } from '@server/features/profile/overview'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request) =>
    readMyOverview(fastify.db, request.user.id),
  )
}

export default route
