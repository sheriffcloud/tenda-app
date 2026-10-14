import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

/**
 * A rate limit keyed by the AUTHENTICATED account, as a preHandler to list
 * after `fastify.authenticate`. It is a second layer, not a replacement: the
 * IP limit in `config.rateLimit` still runs first and stays the outer bound
 * (see plugins/rate-limit.ts), because accounts are free to create.
 *
 * Built on the library's `createRateLimit` so it shares the plugin's store (the
 * Redis one when configured) and counts the same way. The key carries the
 * route, so two routes with an account limit never draw on one bucket, and
 * never on an IP bucket: `acct:` cannot collide with an address.
 *
 * Answers the house 429 (RATE_LIMITED, `retry_after`), same as the IP layer.
 *
 * Without the rate-limit plugin registered (the HTTP test harness builds its
 * app from a hand-picked plugin list) there is no limiter to ask, and this is
 * a pass-through, exactly as `config.rateLimit` is inert there. The app
 * autoloads the plugin, so a deployment always has it.
 */
export function accountRateLimit(
  fastify: FastifyInstance,
  limit: { readonly max: number; readonly timeWindow: string | number },
) {

  if (!fastify.hasDecorator('createRateLimit')) return async () => undefined
  const check = fastify.createRateLimit({
    max: limit.max,
    timeWindow: limit.timeWindow,
    keyGenerator: (request: FastifyRequest) => `acct:${request.routeOptions.url}:${request.user.id}`,
  })
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = await check(request)
    if (result.isAllowed || !result.isExceeded) return
    reply.header('retry-after', result.ttlInSeconds)
    throw new AppError(
      429,
      ErrorCode.RATE_LIMITED,
      `Rate limit exceeded for this account, retry in ${result.ttlInSeconds} seconds`,
      { retry_after: result.ttlInSeconds },
    )
  }
}
