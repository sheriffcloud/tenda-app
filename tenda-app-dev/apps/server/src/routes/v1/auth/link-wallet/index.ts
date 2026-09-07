/**
 * POST /v1/auth/link-wallet, add a second wallet to an authenticated user.
 *
 * Same nonce + signature flow as /wallet, but starts with an authenticated
 * session (the existing user) and signs from the NEW wallet to prove it.
 * The new wallet must not already belong to anyone.
 *
 * Body: { chain_id, address, message, signature }
 *
 * Failure paths:
 *   - 401 UNAUTHORIZED if not authenticated.
 *   - 400 VALIDATION_ERROR for bad body / auth message.
 *   - 401 AUTH_NONCE_{UNKNOWN,REPLAY,EXPIRED} on nonce issues.
 *   - 401 INVALID_SIGNATURE if signature doesn't verify.
 *   - 409 VALIDATION_ERROR if the wallet is already linked (to anyone).
 *
 * Runtime caveat: writes `user_wallets` (v2 schema). Type-correct today;
 * runs end-to-end once #34 cutover migration applies.
 */

import type { FastifyPluginAsync } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { user_wallets } from '@tenda/shared/db/schema'
import { AppError, requireBody, requireNonEmptyString } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'
import { verifyWalletAuth } from '@server/lib/auth/strategies/wallet'
import { hasVerifiedPhone } from '@server/lib/auth/resolver'
import { walletAddressEquals } from '@server/lib/auth/wallet-address'
import { fireRetroactiveGasSeed } from '@server/features/gas-seed'

interface Body {
  chain_id: string
  address: string
  message: string
  signature: string
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Body }>(
    '/',
    {
      preHandler: [fastify.authenticate],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const body = requireBody(request.body)
      requireNonEmptyString(body.chain_id, 'chain_id')
      requireNonEmptyString(body.address, 'address')
      requireNonEmptyString(body.message, 'message')
      requireNonEmptyString(body.signature, 'signature')

      // Shared verify-message-and-signature flow (parse → assert → sig-verify
      // → single-use nonce consume); identical to /auth/wallet + the unified
      // /auth/verify wallet strategy. Returns the CANONICAL address (EVM
      // lowercased) so the dedup constraint catches the same wallet linked in a
      // different case.
      const { chain_ns, address } = await verifyWalletAuth(
        { chains: fastify.chains, db: fastify.db, now: () => new Date() },
        body,
      )

      // Case-insensitive "already linked" check (EVM): the PK is case-sensitive,
      // so a wallet stored as a legacy mixed-case row wouldn't conflict with its
      // lowercased re-link, re-creating the duplicate. Reject any case-variant
      // that already exists for anyone.
      const existing = await fastify.db
        .select({ user_id: user_wallets.user_id })
        .from(user_wallets)
        .where(and(eq(user_wallets.chain_ns, chain_ns), walletAddressEquals(chain_ns, address)))
        .limit(1)
      if (existing.length > 0) {
        throw new AppError(409, ErrorCode.VALIDATION_ERROR, `wallet ${chain_ns}:${address} is already linked`)
      }

      // Race-safe insert: the (chain_ns, address) UNIQUE constraint still settles
      // parallel exact-case attempts (the pre-check can't, not being atomic);
      // `onConflictDoNothing` → 0 rows maps to the same 409. See open_issues S0-2.
      const inserted = await fastify.db
        .insert(user_wallets)
        .values({
          chain_ns,
          address,
          user_id: request.user.id,
          is_primary: false,
        })
        .onConflictDoNothing()
        .returning({ user_id: user_wallets.user_id })

      if (inserted.length === 0) {
        throw new AppError(
          409,
          ErrorCode.VALIDATION_ERROR,
          `wallet ${chain_ns}:${address} is already linked`,
        )
      }

      // Gas-seed check on every successful link (stage-1, decision #16):
      // only phone-verified users are eligible; the dispatcher itself is
      // idempotent per (user, chain). Fire-and-forget, linking must not
      // block on an RPC transfer.
      if (await hasVerifiedPhone(fastify.db, request.user.id)) {
        fireRetroactiveGasSeed(fastify, request.user.id)
      }

      return { ok: true }
    },
  )
}

export default route
