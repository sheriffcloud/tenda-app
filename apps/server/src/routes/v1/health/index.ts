import { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'

const health: FastifyPluginAsync = async (fastify) => {
  // GET /v1/health, liveness probe for container orchestration / load balancers.
  // Intentionally no auth and no DB query, must respond even if DB is down.
  // Rate limited to prevent it being used as a no-cost amplification endpoint.
  fastify.get('/', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async () => ({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
  }))

  // GET /v1/health/ready, readiness probe. Returns 503 if the DB is unreachable.
  // Used by container orchestrators to gate traffic until the server is fully ready.
  fastify.get('/ready', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (_request, reply) => {
    try {
      await fastify.db.execute(sql`SELECT 1`)
      return { status: 'ready' }
    } catch {
      return reply.code(503).send({ status: 'unavailable' })
    }
  })
}

export default health
