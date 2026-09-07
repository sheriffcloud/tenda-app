/**
 * Admin-dashboard login helpers (#84–#87).
 *
 * INVARIANT (schema/identity.ts admin_users doc-comment): admin_users is
 * the LOGIN REGISTRY only, granting an email here never grants authority;
 * users.role through ROLE_PERMISSIONS stays the single truth, and the
 * OTP-verify route re-checks role + status at verify time.
 */

import { and, eq, or } from 'drizzle-orm'
import { admin_users, user_identities, users } from '@tenda/shared/db/schema/identity'
import { ADMIN_ROLES, ErrorCode, EMAIL_MAX_LENGTH, isE164, normalizeEmail } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { isPostgresUniqueViolation } from '@server/lib/db'
import { isUuidLike } from '@server/lib/uuid'
import type { AppDatabase } from '@server/plugins/db'

/** @deprecated alias kept for call sites, admin email cap is the shared {@link EMAIL_MAX_LENGTH}. */
export const ADMIN_EMAIL_MAX_LENGTH = EMAIL_MAX_LENGTH

/** Lowercase + trim; null when the shape is invalid. Delegates to the shared normaliser. */
export function normalizeAdminEmail(raw: string): string | null {
  return normalizeEmail(raw)
}

/**
 * Attach (or rotate) the dashboard login email for an EXISTING admin.
 * Grants LOGIN only, never touches users.role; promotion is
 * PATCH /v1/admin/users/:id/role. Callers: the ops bootstrap script
 * (#85, added_by = null) and the super_admin provisioning surface (#87,
 * added_by = acting admin).
 */
export async function grantAdminEmail(
  db: AppDatabase,
  args: { user_id: string; email: string; added_by: string | null },
): Promise<{ user_id: string; email: string; role: string }> {
  if (!isUuidLike(args.user_id)) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'user_id must be a UUID')
  }
  const email = normalizeAdminEmail(args.email)
  if (email === null) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'invalid email address')
  }

  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, args.user_id))
    .limit(1)
  if (user === undefined) {
    throw new AppError(404, ErrorCode.USER_NOT_FOUND, 'User not found')
  }
  if (!ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) {
    throw new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      `user role is '${user.role}', login email requires an existing admin; promote via PATCH /v1/admin/users/:id/role first`,
    )
  }

  try {
    await db
      .insert(admin_users)
      .values({ user_id: args.user_id, email, added_by: args.added_by })
      .onConflictDoUpdate({
        target: admin_users.user_id,
        set: { email, added_by: args.added_by },
      })
  } catch (err) {
    // The user_id conflict is handled above, reaching here means the
    // EMAIL unique constraint: another admin already logs in with it.
    if (isPostgresUniqueViolation(err)) {
      throw new AppError(409, ErrorCode.EMAIL_IN_USE, 'email already assigned to another admin')
    }
    throw err
  }
  return { user_id: args.user_id, email, role: user.role }
}

export type AdminCandidate = {
  user_id: string
  role: string
  status: string
  first_name: string
  last_name: string
  matched_via: 'uuid' | 'email' | 'phone'
  /** Normalised value we matched on — for the ops-script confirm echo. */
  matched_identifier: string
}

/**
 * Resolve the human an ops grant/promotion is about from the contact an
 * operator actually knows — a login email, an E.164 phone, or (back-compat)
 * the raw UUID. Returns EVERY distinct match so callers can refuse on
 * ambiguity and confirm before any write. Lookup only: never mutates,
 * never touches role. Not a runtime surface (ops scripts only).
 */
export async function resolveAdminCandidates(
  db: AppDatabase,
  rawContact: string,
): Promise<AdminCandidate[]> {
  const contact = rawContact.trim()
  const cols = {
    user_id: users.id,
    role: users.role,
    status: users.status,
    first_name: users.first_name,
    last_name: users.last_name,
  }

  // 1) UUID — direct users lookup (keeps the #87 muscle-memory path working).
  if (isUuidLike(contact)) {
    const rows = await db.select(cols).from(users).where(eq(users.id, contact)).limit(1)
    return rows.map((r) => ({ ...r, matched_via: 'uuid' as const, matched_identifier: contact }))
  }

  // 2) Email — match the email credential OR any OAuth row carrying it.
  if (contact.includes('@')) {
    const email = normalizeAdminEmail(contact)
    if (email === null) return []
    const rows = await db
      .selectDistinct(cols)
      .from(user_identities)
      .innerJoin(users, eq(users.id, user_identities.user_id))
      .where(
        or(
          and(eq(user_identities.kind, 'email'), eq(user_identities.identifier, email)),
          eq(user_identities.email, email),
        ),
      )
    return rows.map((r) => ({ ...r, matched_via: 'email' as const, matched_identifier: email }))
  }

  // 3) Otherwise a phone — must be E.164 (+countrycode…). No silent guessing
  // of country codes; a bare local number is rejected by the caller.
  if (!isE164(contact)) return []
  const rows = await db
    .select(cols)
    .from(user_identities)
    .innerJoin(users, eq(users.id, user_identities.user_id))
    .where(and(eq(user_identities.kind, 'phone'), eq(user_identities.identifier, contact)))
  return rows.map((r) => ({ ...r, matched_via: 'phone' as const, matched_identifier: contact }))
}

/** Privilege rank — higher is more powerful. Used to forbid ops-script demotion. */
const ROLE_RANK: Record<string, number> = { user: 0, dispute_admin: 1, super_admin: 2 }

/**
 * Ops bootstrap ONLY: set users.role to an admin role for the zero-state
 * FIRST super_admin, when no dashboard admin exists yet to call the audited
 * PATCH /v1/admin/users/:id/role. PROMOTION only — refuses to demote, since
 * demotion must go through that route (it also releases open disputes and
 * revokes dashboard logins in-transaction; this helper does neither because
 * a promotion never needs them). Idempotent: a no-op if the user already
 * holds the target role.
 */
export async function setAdminRole(
  db: AppDatabase,
  args: { user_id: string; role: (typeof ADMIN_ROLES)[number] },
): Promise<{ user_id: string; previous_role: string; role: string }> {
  if (!isUuidLike(args.user_id)) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'user_id must be a UUID')
  }
  if (!ADMIN_ROLES.includes(args.role)) {
    throw new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      `role must be one of: ${ADMIN_ROLES.join(', ')}`,
    )
  }

  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, args.user_id))
    .limit(1)
  if (user === undefined) {
    throw new AppError(404, ErrorCode.USER_NOT_FOUND, 'User not found')
  }

  if (user.role === args.role) {
    return { user_id: user.id, previous_role: user.role, role: user.role }
  }
  if (ROLE_RANK[args.role] < ROLE_RANK[user.role]) {
    throw new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      `refusing to demote '${user.role}' → '${args.role}'; demote via PATCH /v1/admin/users/:id/role (audited)`,
    )
  }

  await db.update(users).set({ role: args.role, updated_at: new Date() }).where(eq(users.id, user.id))
  return { user_id: user.id, previous_role: user.role, role: args.role }
}
