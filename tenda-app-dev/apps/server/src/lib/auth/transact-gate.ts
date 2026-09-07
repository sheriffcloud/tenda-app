/**
 * The transaction-capability half of the auth resolver (Stage 9D): who CAN
 * sign a chain transaction, and with WHICH wallet. Split from ./resolver
 * (300-line ceiling) along its own seam — resolver keeps the login-identity
 * union (who can sign IN), this file keeps the gates the escrow routes run
 * before building anything a wallet must sign. `@server/lib/auth/resolver`
 * re-exports everything here, so no call site changed.
 */

import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm'
import { user_identities, user_wallets, users } from '@tenda/shared/db/schema'
import type { ChainNamespace } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { AppDatabase } from '@server/plugins/db'

/**
 * The wallet the tx builders resolve for a user on a namespace — primary
 * first, deterministic. ONE definition shared by the chain adapters'
 * `resolveWalletAddress` dep and the routes that must RECORD what a build
 * will bake (`escrows.assigned_counterparty_address`): two copies of this
 * query is how the recorded wallet and the baked wallet would drift apart.
 * Null when the user has no wallet on the namespace.
 */
export async function resolvePrimaryWalletAddress(
  db: AppDatabase,
  userId: string,
  chainNs: ChainNamespace,
): Promise<string | null> {
  const rows = await db
    .select({ address: user_wallets.address })
    .from(user_wallets)
    .where(and(eq(user_wallets.user_id, userId), eq(user_wallets.chain_ns, chainNs)))
    .orderBy(desc(user_wallets.is_primary))
    .limit(1)
  return rows[0]?.address ?? null
}

/** True if the user has a linked wallet on the given chain namespace, the
 *  "can sign a tx on this chain" half of the first-transaction gate (9D). */
export async function hasWalletOnChain(
  db: AppDatabase,
  userId: string,
  chainNs: ChainNamespace,
): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(user_wallets)
    .where(and(eq(user_wallets.user_id, userId), eq(user_wallets.chain_ns, chainNs)))
    .limit(1)
  return rows.length > 0
}

/**
 * True if the user has at least one verified contact channel, a verified
 * phone, or any identity carrying a verified email (email-OTP or OAuth).
 * Backs the first-transaction reachability gate (Stage 9D).
 */
export async function hasVerifiedContact(db: AppDatabase, userId: string): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(user_identities)
    .where(
      and(
        eq(user_identities.user_id, userId),
        isNotNull(user_identities.verified_at),
        or(eq(user_identities.kind, 'phone'), isNotNull(user_identities.email)),
      ),
    )
    .limit(1)
  return rows.length > 0
}

/** True when the account is an autonomous agent (`users.is_agent`, #19). */
export async function isAgentAccount(db: AppDatabase, userId: string): Promise<boolean> {
  const rows = await db
    .select({ is_agent: users.is_agent })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return rows[0]?.is_agent === true
}

/**
 * First-transaction gate (Stage 9D, deferred wallet + verified contact).
 * Before building any unsigned tx the caller must sign (escrow create / accept
 * / publish), require BOTH:
 *   1. a linked wallet on the escrow's chain namespace → 403 WALLET_REQUIRED,
 *      carrying { chain_ns } so the client opens the right link-wallet flow.
 *   2. ≥1 verified contact channel (email or phone) → 403 CONTACT_REQUIRED.
 *      Push is device-bound and not a guaranteed recovery/reachability channel,
 *      so a durable contact is mandatory before a user can enter an escrow.
 * Wallet is checked first: it is the deferred half and the most common gap.
 * Every account today is born from a contact-bearing method, so the contact
 * check is the enforcement point for the reachability invariant against any
 * future contactless account path (admin-created, migration, new method).
 */
export async function assertCanTransact(
  db: AppDatabase,
  userId: string,
  chainNs: ChainNamespace,
): Promise<void> {
  if (!(await hasWalletOnChain(db, userId, chainNs))) {
    throw new AppError(
      403,
      ErrorCode.WALLET_REQUIRED,
      `link a ${chainNs} wallet before you can transact on this chain`,
      { chain_ns: chainNs },
    )
  }
  // An agent (#19) is born from a wallet and has no phone or email to verify;
  // its reachability is its operator's problem, and every surface badges it
  // so the humans it deals with know. The wallet half above still binds.
  if (await isAgentAccount(db, userId)) return
  if (!(await hasVerifiedContact(db, userId))) {
    throw new AppError(
      403,
      ErrorCode.CONTACT_REQUIRED,
      'verify an email address or phone number before your first transaction',
    )
  }
}

/**
 * Direct-assign create guard (Stage 9D follow-up), now RESOLVING: a
 * directly-assigned escrow bakes the assignee's wallet address into the
 * on-chain account at creation, so the assignee must already have a wallet on
 * the chain — and the create routes must RECORD which wallet that is
 * (`escrows.assigned_counterparty_address`). One call answers both: the same
 * primary-first read the builder's resolver runs, throwing the same typed 422
 * when there is nothing to bake. Distinct from `assertCanTransact` (which
 * gates the CALLER) and from WALLET_REQUIRED — the client must NOT route the
 * caller to link a wallet; it's the assignee who needs one. Without this the
 * adapter's raw `resolveWalletAddress` throws a misleading 404 USER_NOT_FOUND
 * that also leaks the assignee's id.
 */
export async function resolveAssigneeWalletAddress(
  db: AppDatabase,
  assigneeId: string,
  chainNs: ChainNamespace,
): Promise<string> {
  const address = await resolvePrimaryWalletAddress(db, assigneeId, chainNs)
  if (address === null) {
    throw new AppError(
      422,
      ErrorCode.ASSIGNEE_WALLET_REQUIRED,
      'the assigned counterparty has not linked a wallet on this chain yet',
      { chain_ns: chainNs, assignee_id: assigneeId },
    )
  }
  return address
}
