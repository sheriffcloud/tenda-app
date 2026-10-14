import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

export default fp(async (fastify) => {
  fastify.register(rateLimit, {
    // Global default: 100 requests per minute per IP.
    // Individual routes can override via config.rateLimit in their route options.
    max: 100,
    timeWindow: '1 minute',
    // Key by IP address, use X-Forwarded-For in production behind a proxy
    keyGenerator: (request) => request.ip,
    // Thrown by the library, so it reaches the house error handler as an AppError:
    // 429 with its own code, rather than the library's default object, which the
    // handler's generic branch labelled "Error" / INTERNAL_ERROR.
    errorResponseBuilder: (_request, context) =>
      new AppError(429, ErrorCode.RATE_LIMITED, `Rate limit exceeded, retry in ${context.after}`, {
        retry_after: Math.ceil(context.ttl / 1000),
      }),
  })
})
