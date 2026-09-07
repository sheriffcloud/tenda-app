/**
 * GET /v1/openapi.json — the Agent API v0 document (src/agent-api).
 *
 * Public and unauthenticated by design: the document describes an anonymous
 * surface, and an agent must be able to discover it before it has anything
 * else. The directory is named `openapi.json` so @fastify/autoload mounts the
 * route at exactly the path the document declares for itself
 * (AGENT_API_DOCUMENT_PATH) — the drift test asserts the two agree.
 */
import type { FastifyPluginAsync } from 'fastify'
import { AGENT_API_CACHE_SECONDS, AGENT_API_DOCUMENT, type OpenApiDocument } from '@server/agent-api/openapi'

const openapiRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: OpenApiDocument }>('/', async (_request, reply) => {
    reply.header('cache-control', `public, max-age=${AGENT_API_CACHE_SECONDS}`)
    return AGENT_API_DOCUMENT
  })
}

export default openapiRoute
