/**
 * Unlink a wallet from a user, atomically. Extracted from the route so the
 * concurrency contract is testable at the DB layer (the route is a thin
 * input-validating wrapper).
 *
 * The whole load → guard → delete runs inside ONE transaction holding a
 * per-user advisory lock, so two concurrent unlinks of DIFFERENT wallets can't
 * each read "2 credentials remain" and both delete, stranding an account with
 * no sign-in method left (TOCTOU). Mirrors the orchestrator's per-email lock.
 *
 * Guards (throw AppError, rolling the tx back):
 *   1. target must be linked to the user (404 NOT_FOUND).
 *   2. never the user's ONLY wallet (409 LAST_WALLET), a wallet is required to
 *      transact, so the account must always keep at least one (stricter than the
 *      identities∪wallets last-credential rule, which a verified email satisfies).
 *   3. not the primary while another wallet remains (409 WALLET_IN_USE).
 *   4. not a party to an active escrow on its namespace (409 WALLET_IN_USE).
 */

import { and, eq, inArray, sql } from 'drizzle-orm'
import { ErrorCode } from '@tenda/shared'
import { chains, type ChainNamespace } from '@tenda/shared/db/schema/chains'
import { escrows } from '@tenda/shared/db/schema/escrow'
import { user_wallets } from '@tenda/shared/db/schema/identity'
import { AppError } from '@server/lib/errors'
import { sameWalletAddress } from '@server/lib/auth/wallet-address'
import { isEscrowParty } from '@server/lib/escrow-party'
import type { AppDatabase } from '@server/plugins/db'

/** Escrow states whose parties still need their wallet's signature. */
const ACTIVE_STATUSES = ['open', 'accepted', 'submitted', 'disputed'] as const

/**
 * Two-key advisory-lock namespace ('tda2') for a user's credential mutations.
 * Disjoint from the single-key test-harness suite lock and the orchestrator's
 * per-email lock (NS 'tda1', `pg_advisory_xact_lock(int4, int4)` space).
 */
const WALLET_UNLINK_LOCK_NS = 0x74_64_61_32

export async function unlinkWallet(
  db: AppDatabase,
  args: { userId: string; chain_ns: ChainNamespace; address: string },
): Promise<void> {
  const { userId, chain_ns } = args
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${WALLET_UNLINK_LOCK_NS}::int4, hashtext(${userId}))`,
    )

    const wallets = await tx
      .select({
        chain_ns: user_wallets.chain_ns,
        address: user_wallets.address,
        is_primary: user_wallets.is_primary,
      })
      .from(user_wallets)
      .where(eq(user_wallets.user_id, userId))

    // Compare case-insensitively for EVM (the stored row may be checksummed
    // legacy data); the DELETE below targets the ACTUAL stored address.
    const target = wallets.find((w) => w.chain_ns === chain_ns && sameWalletAddress(chain_ns, w.address, args.address))
    if (target === undefined) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'that wallet isn’t linked to your account')
    }
    // Always keep at least one wallet, a wallet is required to transact, so the
    // account must never go wallet-free (even with a verified email/phone). The
    // load runs under the per-user advisory lock, so two concurrent unlinks
    // can't both read "2 remain" and strand the account.
    if (wallets.length <= 1) {
      throw new AppError(
        409,
        ErrorCode.LAST_WALLET,
        'keep at least one wallet linked, you can’t unlink your only wallet',
      )
    }
    // Another wallet always remains here (the sole-wallet guard above ensures
    // length > 1), so a primary target must hand off the marker first. Its own
    // code (not WALLET_IN_USE) so the client doesn't mislabel it as an escrow.
    if (target.is_primary) {
      throw new AppError(
        409,
        ErrorCode.WALLET_IS_PRIMARY,
        'set another wallet as primary before unlinking this one',
      )
    }

    // Active escrows on this namespace bind the wallet's signing ability.
    const active = await tx
      .select({ id: escrows.id })
      .from(escrows)
      .innerJoin(chains, eq(escrows.chain_id, chains.id))
      .where(
        and(
          eq(chains.namespace, chain_ns),
          inArray(escrows.status, [...ACTIVE_STATUSES]),
          isEscrowParty(userId),
        ),
      )
    if (active.length > 0) {
      throw new AppError(409, ErrorCode.WALLET_IN_USE, 'wallet is a party to active escrows', {
        escrow_ids: active.map((e) => e.id),
      })
    }

    await tx
      .delete(user_wallets)
      .where(
        and(
          eq(user_wallets.user_id, userId),
          eq(user_wallets.chain_ns, chain_ns),
          eq(user_wallets.address, target.address),
        ),
      )
  })
}
