/**
 * GET /v1/gigs/featured, the CO8 curated rail (home-top carousel).
 * Public, separately cached (60s in-process); the main feed query is
 * untouched by curation.
 */
import type { FastifyPluginAsync } from 'fastify'
import type { ApiError, GigSummary } from '@tenda/shared'
import { getFeaturedGigs } from '@server/lib/featured'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: { data: GigSummary[] } | ApiError }>('/', async () => {
    return { data: await getFeaturedGigs(fastify.db) }
  })
}

export default route
