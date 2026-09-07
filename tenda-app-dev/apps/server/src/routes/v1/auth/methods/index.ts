/**
 * GET /v1/auth/methods, the authenticated user's non-wallet sign-in identities
 * (phone / email / google / apple), for the mobile "Sign-in & security" screen.
 *
 * Wallets are intentionally NOT here, they already ride /v1/users/me (with
 * chain + primary structure). This route is the read counterpart to the unified
 * link flow (POST /v1/auth/challenge + /verify with a bearer): the screen lists
 * what's linked, and routes the user into the OTP flow to add what isn't.
 */

import type { FastifyPluginAsync } from 'fastify'
import type { LoginMethodsResponse } from '@tenda/shared'
import { listLoginMethods } from '@server/lib/auth/resolver'

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request): Promise<LoginMethodsResponse> => {
    const methods = await listLoginMethods(fastify.db, request.user.id)
    const identities = methods.flatMap((m) =>
      m.type === 'identity'
        ? [{ kind: m.kind, identifier: m.identifier, email: m.email, verified: m.verified }]
        : [],
    )
    return { identities }
  })
}

export default route
