/**
 * The gas-seed claim endpoints (#53c-1).
 *
 * THIN ON PURPOSE. Every decision — the guards, the ordering of refusals, the
 * mapping from a refusal to a status code — lives in `features/gas-seed/claim`,
 * where it is covered by unit tests rather than only by HTTP fixtures. This file
 * does three things: authenticate, hand the session's identity to the feature,
 * and pick the success status.
 *
 * Autoloaded, so this DIRECTORY is the registration: deleting it removes both
 * endpoints, which is step 2 of the removal recipe in the feature's barrel.
 */

import { FastifyPluginAsync } from 'fastify'
import { parseSessionClient } from '@tenda/shared'
import type { ApiError, WalletContract } from '@tenda/shared'
import { requireBody } from '@server/lib/errors'
import {
  buildGasSeedClaimDeps,
  claimGasSeed,
  gasSeedAvailability,
  type ClaimIdentity,
} from '@server/features/gas-seed'

type AvailabilityRoute = WalletContract['gasSeedAvailability']
type ClaimRoute = WalletContract['claimGasSeed']

const gasSeed: FastifyPluginAsync = async (fastify) => {
  /**
   * The session as the gate sees it.
   *
   * The token's `client` claim is RE-PARSED rather than trusted for its shape.
   * The claim is data that was signed at some earlier point — by an older build,
   * possibly by a code path that no longer exists — and `parseSessionClient` is
   * the one place that decides what counts as a known client. Anything else
   * reads as absent, which the evaluator refuses.
   */
  const identityOf = (user: { id: string; client?: string }): ClaimIdentity => ({
    user_id: user.id,
    client: parseSessionClient(user.client),
  })

  // GET /v1/wallet/gas-seed — per-user, per-chain availability.
  //
  // Not on /v1/platform/chains, which is where chain facts otherwise live: that
  // surface is cached globally and this answer depends on WHO is asking (their
  // wallets, their grants, their session). Caching it there would serve one
  // user's eligibility to everyone.
  fastify.get<{ Reply: AvailabilityRoute['response'] | ApiError }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) =>
      gasSeedAvailability(buildGasSeedClaimDeps(fastify), identityOf(request.user)),
  )

  // POST /v1/wallet/gas-seed — claim this chain's seed.
  //
  // Rate-limited like the other write endpoints that cost something downstream:
  // the grant's primary key already makes a second claim a no-op, so this is
  // about the RPC and queue work a tight loop of refused claims would generate,
  // not about double-paying.
  fastify.post<{
    Body: ClaimRoute['body']
    Reply: ClaimRoute['response'] | ApiError
  }>(
    '/',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { chain_id } = requireBody(request.body)
      const result = await claimGasSeed(
        buildGasSeedClaimDeps(fastify),
        identityOf(request.user),
        chain_id,
      )
      // 202 either way: the claim is accepted and the transfer happens later.
      // `queued` distinguishes "this request started it" from "it was already
      // under way", which is the honest answer to a double tap — a 409 there
      // would tell a user who tapped twice that something went wrong.
      return reply.code(202).send(result)
    },
  )
}

export default gasSeed
