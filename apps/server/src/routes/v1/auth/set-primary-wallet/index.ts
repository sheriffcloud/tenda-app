/**
 * POST /v1/auth/set-primary-wallet, switch the main wallet FOR ONE CHAIN FAMILY.
 *
 * Per namespace, not per account (#42). The partial unique index
 * `user_wallets_one_primary_per_chain_idx` on (user_id, chain_ns) makes the
 * invariant DB-enforced; the swap runs in one transaction so no window exists
 * with two mains on a namespace, or none.
 *
 * The clear below is SCOPED to the namespace, and that scoping is the whole
 * behaviour change. It used to clear every primary the user had, so choosing an
 * EVM wallet silently un-chose their Solana one — the account-wide marker this
 * endpoint's own body signature (`{ chain_ns, address }`) already implied it
 * was not. A user now answers the question once per chain family.
 *
 * Body: { chain_ns, address }.
 */

import type { FastifyPluginAsync } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { ErrorCode } from '@tenda/shared'
import { chainNamespaceEnum, type ChainNamespace } from '@tenda/shared/db/schema/chains'
import { user_wallets } from '@tenda/shared/db/schema/identity'
import { AppError } from '@server/lib/errors'
import { walletAddressEquals } from '@server/lib/auth/wallet-address'

interface Body {
  chain_ns?: unknown
  address?: unknown
}

const route: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Body }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const chain_ns = request.body?.chain_ns
      const address = request.body?.address
      if (
        typeof chain_ns !== 'string' ||
        !(chainNamespaceEnum as readonly string[]).includes(chain_ns) ||
        typeof address !== 'string' ||
        address === ''
      ) {
        throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'chain_ns and address are required')
      }
      const ns = chain_ns as ChainNamespace
      const user_id = request.user.id

      // Match case-insensitively for EVM (legacy rows may be checksummed); the
      // updates target the ACTUAL stored address the lookup returns.
      const stored = await fastify.db.transaction(async (tx) => {
        const target = await tx
          .select({ address: user_wallets.address })
          .from(user_wallets)
          .where(
            and(
              eq(user_wallets.user_id, user_id),
              eq(user_wallets.chain_ns, ns),
              walletAddressEquals(ns, address),
            ),
          )
          .limit(1)
        const storedAddress = target[0]?.address
        if (storedAddress === undefined) {
          throw new AppError(404, ErrorCode.NOT_FOUND, 'that wallet isn’t linked to your account')
        }
        // Only THIS namespace's main wallet is displaced. Without the
        // chain_ns clause the user's choice on every other chain is wiped.
        await tx
          .update(user_wallets)
          .set({ is_primary: false })
          .where(
            and(
              eq(user_wallets.user_id, user_id),
              eq(user_wallets.chain_ns, ns),
              eq(user_wallets.is_primary, true),
            ),
          )
        await tx
          .update(user_wallets)
          .set({ is_primary: true })
          .where(
            and(
              eq(user_wallets.user_id, user_id),
              eq(user_wallets.chain_ns, ns),
              eq(user_wallets.address, storedAddress),
            ),
          )
        return storedAddress
      })
      return { primary: { chain_ns: ns, address: stored } }
    },
  )
}

export default route
