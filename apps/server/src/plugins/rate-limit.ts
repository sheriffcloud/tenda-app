import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'

export default fp(async (fastify) => {
  fastify.register(rateLimit, {
    // Global default: 100 requests per minute per IP.
    // Individual routes can override via config.rateLimit in their route options.
    max: 100,
    timeWindow: '1 minute',
    // Key by IP address, use X-Forwarded-For in production behind a proxy
    keyGenerator: (request) => request.ip,
  })
})
