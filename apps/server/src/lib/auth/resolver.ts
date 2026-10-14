/**
 * Stage 9 login-identity resolver, the SINGLE place that unifies the two
 * physical credential stores (`user_identities` for phone/email/OAuth,
 * `user_wallets` for wallets) behind one logical "who can sign in as this
 * user" interface. Every auth/link/unlink route consumes these helpers so
 * the union logic lives in exactly one place.
 *
 * Wallet deliberately stays in `user_wallets` (it carries chain structure +
 * is a transaction capability); uniformity lives here at the interface, not
 * in a single table.
 */

import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { user_identities, user_wallets } from '@tenda/shared/db/schema'
import type { ChainNamespace, IdentityKind } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { walletAddressEquals } from '@server/lib/auth/wallet-address'
import type { AppDatabase, AppDb } from '@server/plugins/db'

/** A non-wallet credential reference (phone/email/google/apple). */
export interface IdentityRef {
  kind: IdentityKind
  identifier: string
}

/** A login method as surfaced to "list my sign-in methods" / last-credential checks. */
export type LoginMethod =
  | { type: 'identity'; kind: IdentityKind; identifier: string; email: string | null; verified: boolean }
  | { type: 'wallet'; chain_ns: ChainNamespace; address: string }

/** Resolve the user that owns a non-wallet credential, or null if unlinked. */
export async function resolveUserByIdentity(
  db: AppDb,
  ref: IdentityRef,
): Promise<string | null> {
  const rows = await db
    .select({ user_id: user_identities.user_id })
    .from(user_identities)
    .where(and(eq(user_identities.kind, ref.kind), eq(user_identities.identifier, ref.identifier)))
    .limit(1)
  return rows[0]?.user_id ?? null
}

/** Resolve the user that owns a wallet, or null if unlinked. */
export async function resolveUserByWallet(
  db: AppDb,
  wallet: { chain_ns: ChainNamespace; address: string },
): Promise<string | null> {
  const rows = await db
    .select({ user_id: user_wallets.user_id })
    .from(user_wallets)
    .where(and(eq(user_wallets.chain_ns, wallet.chain_ns), walletAddressEquals(wallet.chain_ns, wallet.address)))
    .limit(1)
  return rows[0]?.user_id ?? null
}

/**
 * Cross-method dedup (decision #5): the user that owns a given VERIFIED email,
 * regardless of which method verified it (email-OTP row, or a google/apple row
 * carrying the same verified email claim). null if none. The orchestrator
 * relies on this to keep "a verified email maps to exactly one user".
 */
export async function findUserByVerifiedEmail(
  db: AppDb,
  email: string,
): Promise<string | null> {
  const rows = await db
    .select({ user_id: user_identities.user_id })
    .from(user_identities)
    .where(and(eq(user_identities.email, email), isNotNull(user_identities.verified_at)))
    .limit(1)
  return rows[0]?.user_id ?? null
}

/** Every login method attached to a user (identities ∪ wallets). */
export async function listLoginMethods(
  db: AppDatabase,
  userId: string,
): Promise<LoginMethod[]> {
  const [identities, wallets] = await Promise.all([
    db
      .select({
        kind: user_identities.kind,
        identifier: user_identities.identifier,
        email: user_identities.email,
        verified_at: user_identities.verified_at,
      })
      .from(user_identities)
      .where(eq(user_identities.user_id, userId)),
    db
      .select({ chain_ns: user_wallets.chain_ns, address: user_wallets.address })
      .from(user_wallets)
      .where(eq(user_wallets.user_id, userId)),
  ])
  return [
    ...identities.map((i): LoginMethod => ({
      type: 'identity',
      kind: i.kind,
      identifier: i.identifier,
      email: i.email,
      verified: i.verified_at !== null,
    })),
    ...wallets.map((w): LoginMethod => ({ type: 'wallet', chain_ns: w.chain_ns, address: w.address })),
  ]
}

/** Total count of sign-in methods (identities + wallets) for last-credential guards. */
export async function countLoginMethods(db: AppDb, userId: string): Promise<number> {
  const [identities, wallets] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(user_identities)
      .where(eq(user_identities.user_id, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(user_wallets)
      .where(eq(user_wallets.user_id, userId)),
  ])
  return (identities[0]?.n ?? 0) + (wallets[0]?.n ?? 0)
}

/**
 * Guard before unlinking a credential: refuse if it is the user's only way to
 * sign back in. Call BEFORE the delete (count reflects current state, so a
 * count of 1 means the row being removed is the last one).
 */
export async function assertNotLastCredential(db: AppDb, userId: string): Promise<void> {
  if ((await countLoginMethods(db, userId)) <= 1) {
    throw new AppError(
      409,
      ErrorCode.LAST_CREDENTIAL,
      'cannot remove your only sign-in method, add another first',
    )
  }
}

/**
 * Timestamp the user's phone was verified (latest verified phone identity), or
 * null. Replaces the dropped `users.phone_verified_at` column as the public
 * "verified human" trust signal, kept Date-typed so the wire field is
 * unchanged (Fastify ISO-serialises it).
 */
export async function phoneVerifiedAt(db: AppDatabase, userId: string): Promise<Date | null> {
  const rows = await db
    .select({ verified_at: user_identities.verified_at })
    .from(user_identities)
    .where(
      and(
        eq(user_identities.user_id, userId),
        eq(user_identities.kind, 'phone'),
        isNotNull(user_identities.verified_at),
      ),
    )
    .orderBy(desc(user_identities.verified_at))
    .limit(1)
  return rows[0]?.verified_at ?? null
}

/** True if the user has a verified phone identity (gas-seed gating, decision #16). */
export async function hasVerifiedPhone(db: AppDatabase, userId: string): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(user_identities)
    .where(
      and(
        eq(user_identities.user_id, userId),
        eq(user_identities.kind, 'phone'),
        isNotNull(user_identities.verified_at),
      ),
    )
    .limit(1)
  return rows.length > 0
}

// The transaction-capability half moved to ./transact-gate (300-line split);
// re-exported so every existing `@server/lib/auth/resolver` import stands.
export {
  assertCanTransact,
  hasVerifiedContact,
  hasWalletOnChain,
  isAgentAccount,
  resolveAssigneeWalletAddress,
  resolvePrimaryWalletAddress,
} from './transact-gate'
