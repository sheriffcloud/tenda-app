/**
 * Admin-dashboard email-OTP login (#86), send/verify service over the
 * email_otps table. Reuses the scrypt code hashing + TTL/attempt policy
 * from lib/otp.ts (phone) so the two OTP channels can't drift.
 *
 * Anti-enumeration: send NEVER reveals whether an email belongs to an
 * admin, unknown emails, demoted/suspended admins, and internally
 * rate-limited sends all produce the same 200. Verify fails with one
 * uniform 401 OTP_INVALID for every "no valid admin + code" combination;
 * OTP_EXPIRED is only reachable with the CORRECT code in hand (expiry is
 * checked after the hash match), so it leaks nothing to a guesser.
 */

import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { randomInt } from 'node:crypto'
import { admin_users, email_otps, users } from '@tenda/shared/db/schema/identity'
import { ADMIN_ROLES, ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import {
  hashOtpCode,
  verifyOtpHash,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_CODE_DIGITS,
} from '@server/lib/otp'
import { normalizeAdminEmail } from '@server/lib/admin-auth'
import { sendViaResend } from '@server/lib/email'
import type { AppDatabase } from '@server/plugins/db'

// ---------- policy constants (deliberately the phone values, own knobs) ----

export const ADMIN_OTP_MAX_SENDS_PER_EMAIL_PER_HOUR = 3
export const ADMIN_OTP_MAX_SENDS_PER_USER_PER_DAY = 10

// ---------- sender seam ------------------------------------------------------

export interface AdminEmailSender {
  send(email: string, code: string): Promise<void>
}

export function resendSender(args: { api_key: string; from: string }): AdminEmailSender {
  return {
    async send(email, code) {
      await sendViaResend(args, {
        to: email,
        subject: 'Your Tenda admin login code',
        text: `Your Tenda admin dashboard login code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.`,
      })
    },
  }
}

/** Development interim (#89 unset, non-production): code lands in the log. */
export function consoleEmailSender(log: { warn(obj: object, msg: string): void }): AdminEmailSender {
  return {
    async send(email, code) {
      log.warn({ email, code }, 'RESEND_API_KEY unset, admin OTP code logged, not sent')
    },
  }
}

// ---------- service ----------------------------------------------------------

export interface AdminOtpDeps {
  db: AppDatabase
  sender: AdminEmailSender
  now(): Date
}

/** Active-admin lookup via the login registry; null = no sendable account. */
async function findActiveAdmin(
  db: AppDatabase,
  email: string,
): Promise<{ user_id: string; role: string } | null> {
  const rows = await db
    .select({ user_id: admin_users.user_id, role: users.role, status: users.status })
    .from(admin_users)
    .innerJoin(users, eq(users.id, admin_users.user_id))
    .where(eq(admin_users.email, email))
    .limit(1)
  const row = rows[0]
  if (row === undefined) return null
  if (row.status !== 'active') return null
  // Registry row without an admin role grants nothing (admin_users invariant).
  if (!ADMIN_ROLES.includes(row.role as (typeof ADMIN_ROLES)[number])) return null
  return { user_id: row.user_id, role: row.role }
}

/**
 * Issue a login code. Resolves void in EVERY outcome the caller may
 * surface, the route returns the same 200 whether a code was sent,
 * the email is unknown, or the account is internally rate-limited.
 */
export async function sendAdminLoginOtp(
  deps: AdminOtpDeps,
  input: { email: string },
  log?: { info(obj: object, msg: string): void },
): Promise<void> {
  const email = normalizeAdminEmail(input.email)
  if (email === null) return
  const admin = await findActiveAdmin(deps.db, email)
  if (admin === null) return

  const now = deps.now()
  const hourAgo = new Date(now.getTime() - 3_600_000)
  const dayAgo = new Date(now.getTime() - 86_400_000)
  const [byEmail, byUser] = await Promise.all([
    countSince(deps.db, eq(email_otps.email, email), hourAgo),
    countSince(deps.db, eq(email_otps.user_id, admin.user_id), dayAgo),
  ])
  if (
    byEmail >= ADMIN_OTP_MAX_SENDS_PER_EMAIL_PER_HOUR ||
    byUser >= ADMIN_OTP_MAX_SENDS_PER_USER_PER_DAY
  ) {
    // Silent skip, a 429 here would be an admin-email oracle.
    log?.info({ email }, 'admin OTP send skipped: rate limited')
    return
  }

  const code = String(randomInt(0, 10 ** OTP_CODE_DIGITS)).padStart(OTP_CODE_DIGITS, '0')
  // One active code per email: a new send invalidates every prior one.
  // Atomic with the insert (project rule: related writes never split
  // across two awaits), also closes the two-concurrent-sends race that
  // could otherwise leave two live codes.
  await deps.db.transaction(async (tx) => {
    await tx
      .update(email_otps)
      .set({ consumed_at: now })
      .where(and(eq(email_otps.email, email), isNull(email_otps.consumed_at)))
    await tx.insert(email_otps).values({
      email,
      user_id: admin.user_id,
      code_hash: hashOtpCode(code),
      expires_at: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
    })
  })
  await deps.sender.send(email, code)
}

const UNIFORM_INVALID = 'invalid email or code'

/**
 * Verify a code and return the admin identity for JWT minting. Role +
 * status are re-checked HERE (not just at send time), a demotion or
 * suspension between send and verify kills the login.
 */
export async function verifyAdminLoginOtp(
  deps: Pick<AdminOtpDeps, 'db' | 'now'>,
  input: { email: string; code: string },
): Promise<{ user_id: string; role: string }> {
  const email = normalizeAdminEmail(input.email)
  if (email === null) throw new AppError(401, ErrorCode.OTP_INVALID, UNIFORM_INVALID)
  const admin = await findActiveAdmin(deps.db, email)
  if (admin === null) throw new AppError(401, ErrorCode.OTP_INVALID, UNIFORM_INVALID)

  const rows = await deps.db
    .select({
      id: email_otps.id,
      code_hash: email_otps.code_hash,
      expires_at: email_otps.expires_at,
      attempts: email_otps.attempts,
    })
    .from(email_otps)
    // user_id binding mirrors the phone store: a code issued while this
    // email mapped to a DIFFERENT admin (rotation between send and
    // verify) must not authenticate the new mapping.
    .where(
      and(
        eq(email_otps.email, email),
        eq(email_otps.user_id, admin.user_id),
        isNull(email_otps.consumed_at),
      ),
    )
    .orderBy(desc(email_otps.created_at))
    .limit(1)
  const active = rows[0]
  if (active === undefined) throw new AppError(401, ErrorCode.OTP_INVALID, UNIFORM_INVALID)
  if (active.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError(401, ErrorCode.OTP_INVALID, UNIFORM_INVALID)
  }
  if (!verifyOtpHash(input.code, active.code_hash)) {
    await deps.db
      .update(email_otps)
      .set({ attempts: sql`${email_otps.attempts} + 1` })
      .where(eq(email_otps.id, active.id))
    throw new AppError(401, ErrorCode.OTP_INVALID, UNIFORM_INVALID)
  }
  // Expiry AFTER the hash match: only the code holder can learn "expired".
  if (deps.now() > active.expires_at) {
    throw new AppError(401, ErrorCode.OTP_EXPIRED, 'code expired, request a new one')
  }
  await deps.db
    .update(email_otps)
    .set({ consumed_at: deps.now() })
    .where(eq(email_otps.id, active.id))
  return admin
}

async function countSince(
  db: AppDatabase,
  condition: ReturnType<typeof eq>,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(email_otps)
    .where(and(condition, gte(email_otps.created_at, since)))
  return rows[0]?.n ?? 0
}

// ---------- wiring ------------------------------------------------------------

/**
 * Resolve the email sender from config (#89 env-gating):
 *   key + from set            → Resend
 *   unset, non-production     → console log (dev interim)
 *   unset, production         → explicit 503, never silently drop codes
 */
export function resolveAdminEmailSender(
  config: { RESEND_API_KEY: string | null; EMAIL_FROM: string | null },
  log: { warn(obj: object, msg: string): void },
): AdminEmailSender {
  if (config.RESEND_API_KEY !== null && config.EMAIL_FROM !== null) {
    return resendSender({ api_key: config.RESEND_API_KEY, from: config.EMAIL_FROM })
  }
  if (process.env.NODE_ENV !== 'production') return consoleEmailSender(log)
  throw new AppError(
    503,
    ErrorCode.SERVICE_UNAVAILABLE,
    'admin login email is not configured (RESEND_API_KEY/EMAIL_FROM)',
  )
}
