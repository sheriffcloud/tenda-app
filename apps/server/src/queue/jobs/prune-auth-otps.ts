/**
 * prune-auth-otps — deletes one-time codes older than the send limits can see.
 *
 * `auth_otps` only ever grew: a row is written per send and nothing removed it,
 * consumed or not. The rows are small and ephemeral, but the table is the one
 * the sign-in path reads on every send.
 *
 * WHAT IT MAY DELETE IS SET BY THE LIMITER, NOT BY THE CODE'S LIFE. A code is
 * dead 10 minutes after it is issued, but `sendOtp` counts rows by `created_at`
 * — consumed and expired ones included — over its windows. Deleting a spent code
 * sooner would lower the count and let someone request more than the limit. So
 * the cutoff is `now - OTP_RETENTION_MS` (the longest window) and nothing newer.
 *
 * `email_otps` (the admin dashboard's codes) has the same shape and the same rule
 * with its own windows, so the same run prunes it against ADMIN_OTP_RETENTION_MS.
 *
 * Daily, one statement per table: the volume is small and the age cutoff keeps
 * each run to a day of rows.
 */
import { OTP_RETENTION_MS } from '@server/features/auth/otp'
import { ADMIN_OTP_RETENTION_MS, pruneAdminOtpsCreatedBefore } from '@server/features/auth/admin/admin-otp'
import { pruneOtpsCreatedBefore } from '@server/features/auth/otp/store'
import type { AppDatabase } from '@server/plugins/db'

export interface PruneAuthOtpsDeps {
  db: AppDatabase
  now(): Date
  log: { info(obj: object, msg: string): void }
}

export async function handlePruneAuthOtps(deps: PruneAuthOtpsDeps): Promise<{ pruned: number; pruned_admin: number }> {
  const now = deps.now().getTime()
  const pruned = await pruneOtpsCreatedBefore(deps.db, new Date(now - OTP_RETENTION_MS))
  const pruned_admin = await pruneAdminOtpsCreatedBefore(deps.db, new Date(now - ADMIN_OTP_RETENTION_MS))
  if (pruned > 0 || pruned_admin > 0) {
    deps.log.info({ pruned, pruned_admin }, 'prune-auth-otps: deleted codes older than the send limits')
  }
  return { pruned, pruned_admin }
}
