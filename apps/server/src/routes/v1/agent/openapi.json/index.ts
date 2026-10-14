/**
 * GET /v1/agent/openapi.json — the SAME Agent API document as /v1/openapi.json,
 * at the path the agent-only subset (#110) used to be served from.
 *
 * The subset is retired (#135, 2026-09-08) and its recorded examples now ride
 * the one document. The path stays because it was handed out — hackathon
 * submission, AskBots project page, round-two reviewers — and a URL that was
 * given must keep answering. Public and unauthenticated for the same reason
 * the canonical route is: an agent must be able to discover the contract
 * before it holds anything. The directory is named `openapi.json` so
 * @fastify/autoload mounts the route at exactly AGENT_API_AGENT_PATH; the
 * drift suite asserts the two paths answer identical bytes.
 */
import type { FastifyPluginAsync } from 'fastify'
import { AGENT_API_CACHE_SECONDS, AGENT_API_DOCUMENT, type OpenApiDocument } from '@tenda/api-doc'

const agentOpenapiAliasRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: OpenApiDocument }>('/', async (_request, reply) => {
    reply.header('cache-control', `public, max-age=${AGENT_API_CACHE_SECONDS}`)
    return AGENT_API_DOCUMENT
  })
}

export default agentOpenapiAliasRoute
