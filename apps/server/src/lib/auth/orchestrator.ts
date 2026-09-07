/**
 * Stage 9 auth orchestrator, turns a strategy `VerifyOutcome` into a user,
 * applying the locked policy:
 *   - block-on-collision (decision #4): linking an identity owned by another
 *     account throws IDENTITY_ALREADY_LINKED; never auto-merge.
 *   - cross-method email dedup (decision #5): a verified email maps to exactly
 *     one user, regardless of which method verified it. Serialised with a
 *     per-email advisory lock so concurrent first-logins (e.g. Google + Apple
 *     with the same verified email) cannot fork into two accounts (X7).
 *   - wallet signs in but never creates (decision #3): find-or-reject.
 * Identity = login credential only; `users.role` still governs all access.
 */

import { and, eq, sql } from 'drizzle-orm'
import { users, user_identities } from '@tenda/shared/db/schema'
import type { ChainNamespace } from '@tenda/shared/db/schema'
import type { User } from '@tenda/shared'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import {
  resolveUserByIdentity,
  resolveUserByWallet,
  findUserByVerifiedEmail,
} from '@server/lib/auth/resolver'
import type { VerifiedIdentity, VerifyOutcome } from '@server/lib/auth/strategy'
import type { AppDatabase, AppDb } from '@server/plugins/db'

/** Profile fields captured at first sign-in; applied ONLY on user create. */
export interface UserBootstrap {
  is_seeker?: boolean
  country?: string | null
}

export interface AuthResolution {
  user: User
  isNew: boolean
}

/**
 * Namespace for the per-email advisory lock. Postgres has two disjoint
 * advisory-lock spaces: the single-key `bigint` form and the two-key
 * `(int4, int4)` form. We use the TWO-KEY form `(NS, hashtext(email))` so this
 * lock can never collide with a single-key lock elsewhere (e.g. the test
 * harness's suite lock `pg_advisory_lock(813370)`), and the namespace isolates
 * it from any other two-key advisory user.
 */
const AUTH_EMAIL_LOCK_NS = 0x74_64_61_31 // 'tda1'

/**
 * Resolve (login), link, or create a user from a verified outcome.
 * `bearerUserId` non-null = an authenticated LINK; null = login/create.
 */
export async function resolveOrLink(
  db: AppDatabase,
  outcome: VerifyOutcome,
  bearerUserId: string | null,
  bootstrap: UserBootstrap = {},
): Promise<AuthResolution> {
  return outcome.type === 'wallet'
    ? resolveWalletLogin(db, outcome.chain_ns, outcome.address)
    : resolveIdentity(db, outcome.identity, bearerUserId, bootstrap)
}

/** Wallet: login-only. An unlinked wallet is rejected (never creates an account). */
async function resolveWalletLogin(
  db: AppDatabase,
  chain_ns: ChainNamespace,
  address: string,
): Promise<AuthResolution> {
  const userId = await resolveUserByWallet(db, { chain_ns, address })
  if (userId === null) {
    throw new AppError(
      404,
      ErrorCode.WALLET_NOT_LINKED,
      'this wallet is not linked to an account, sign in or get started with phone, email, Google, or Apple, then link it',
    )
  }
  return { user: await loadUser(db, userId), isNew: false }
}

async function resolveIdentity(
  db: AppDatabase,
  identity: VerifiedIdentity,
  bearerUserId: string | null,
  bootstrap: UserBootstrap,
): Promise<AuthResolution> {
  const email = identity.email
  if (email !== null) {
    // Email-bearing: serialise the whole link/create/dedup decision per email
    // so two concurrent first-logins with the same verified email (different
    // methods → different (kind,identifier)) can't both create an account.
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${AUTH_EMAIL_LOCK_NS}::int4, hashtext(${email}))`,
      )
      if (bearerUserId !== null) return linkToUser(tx, identity, bearerUserId)
      const owner = await resolveUserByIdentity(tx, {
        kind: identity.kind,
        identifier: identity.identifier,
      })
      if (owner !== null) return { user: await loadUser(tx, owner), isNew: false }
      const emailOwner = await findUserByVerifiedEmail(tx, email)
      if (emailOwner !== null) {
        // Same verified email under a new method → attach to that user (dedup, not merge).
        await insertIdentity(tx, identity, emailOwner)
        return { user: await loadUser(tx, emailOwner), isNew: false }
      }
      return createUserAndIdentity(tx, identity, bootstrap)
    })
  }

  // No email (phone / OAuth without email), the (kind,identifier) UNIQUE fully
  // serialises duplicates, so no advisory lock is needed.
  if (bearerUserId !== null) return linkToUser(db, identity, bearerUserId)
  const owner = await resolveUserByIdentity(db, {
    kind: identity.kind,
    identifier: identity.identifier,
  })
  if (owner !== null) return { user: await loadUser(db, owner), isNew: false }
  // Create needs a transaction for the orphan-rollback race recovery.
  return db.transaction((tx) => createUserAndIdentity(tx, identity, bootstrap))
}

/** Attach an identity to the authenticated user; block if it (or its email) is foreign. */
async function linkToUser(
  db: AppDb,
  identity: VerifiedIdentity,
  bearerUserId: string,
): Promise<AuthResolution> {
  const existingOwner = await resolveUserByIdentity(db, {
    kind: identity.kind,
    identifier: identity.identifier,
  })
  const emailOwner =
    identity.email !== null ? await findUserByVerifiedEmail(db, identity.email) : null
  assertNotOwnedByAnother(existingOwner, bearerUserId)
  assertNotOwnedByAnother(emailOwner, bearerUserId)
  if (existingOwner === bearerUserId) {
    await markIdentityVerified(db, identity, bearerUserId)
  } else {
    await insertIdentity(db, identity, bearerUserId)
  }
  return { user: await loadUser(db, bearerUserId), isNew: false }
}

function assertNotOwnedByAnother(ownerId: string | null, selfId: string): void {
  if (ownerId !== null && ownerId !== selfId) {
    throw new AppError(
      409,
      ErrorCode.IDENTITY_ALREADY_LINKED,
      'this identity is already linked to another account',
    )
  }
}

async function insertIdentity(
  db: AppDb,
  identity: VerifiedIdentity,
  userId: string,
): Promise<void> {
  const inserted = await db
    .insert(user_identities)
    .values({
      user_id: userId,
      kind: identity.kind,
      identifier: identity.identifier,
      email: identity.email,
      verified_at: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: user_identities.id })
  if (inserted.length === 0) {
    // Lost the (kind, identifier) race, re-resolve and block if it landed elsewhere.
    const owner = await resolveUserByIdentity(db, {
      kind: identity.kind,
      identifier: identity.identifier,
    })
    assertNotOwnedByAnother(owner, userId)
  }
}

async function markIdentityVerified(
  db: AppDb,
  identity: VerifiedIdentity,
  userId: string,
): Promise<void> {
  await db
    .update(user_identities)
    .set({ verified_at: new Date(), email: identity.email })
    .where(
      and(
        eq(user_identities.user_id, userId),
        eq(user_identities.kind, identity.kind),
        eq(user_identities.identifier, identity.identifier),
      ),
    )
}

/**
 * Create a user + its first identity. Runs inside the caller's transaction (so
 * the orphan-rollback on a lost (kind,identifier) race is atomic). Returns the
 * race winner if a concurrent request created the same identity first.
 */
async function createUserAndIdentity(
  db: AppDb,
  identity: VerifiedIdentity,
  bootstrap: UserBootstrap,
): Promise<AuthResolution> {
  const [created] = await db
    .insert(users)
    .values({ is_seeker: bootstrap.is_seeker ?? false, country: bootstrap.country ?? null })
    .returning()
  if (created === undefined) {
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'user insert returned no row')
  }
  const inserted = await db
    .insert(user_identities)
    .values({
      user_id: created.id,
      kind: identity.kind,
      identifier: identity.identifier,
      email: identity.email,
      verified_at: new Date(),
    })
    .onConflictDoNothing()
    .returning({ user_id: user_identities.user_id })

  if (inserted.length > 0) return { user: created, isNew: true }

  // Concurrent first-login created the same identity, roll back our orphan
  // user (net-zero) and log in as the race winner instead.
  await db.delete(users).where(eq(users.id, created.id))
  const winnerId = await resolveUserByIdentity(db, {
    kind: identity.kind,
    identifier: identity.identifier,
  })
  if (winnerId === null) {
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'identity race winner not found')
  }
  return { user: await loadUser(db, winnerId), isNew: false }
}

async function loadUser(db: AppDb, userId: string): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (user === undefined) {
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'resolved user row missing')
  }
  return user
}
