/**
 * `auth_otps` persistence for the OTP service (rate-limit counts, active-code
 * lookup, attempt/consume). Behind an interface so the service unit-tests with
 * an in-memory fake.
 */

import type { OtpChannel } from '@tenda/shared/db/schema'
import { auth_otps } from '@tenda/shared/db/schema'
import { and, eq, gte, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '@server/plugins/db'

export interface OtpStore {
  countRecentByIdentifier(channel: OtpChannel, identifier: string, since: Date): Promise<number>
  countRecentByUser(user_id: string, since: Date): Promise<number>
  insert(row: {
    channel: OtpChannel
    identifier: string
    user_id: string | null
    code_hash: string
    expires_at: Date
  }): Promise<void>
  /**
   * Latest unconsumed OTP for (channel, identifier, user binding). A null
   * user_id matches pre-account rows (passwordless first sign-in); a set
   * user_id binds to that user (stops a second authenticated session from
   * consuming a code issued in someone else's, shared-device edge).
   */
  findActive(
    channel: OtpChannel,
    identifier: string,
    user_id: string | null,
  ): Promise<{
    id: string
    code_hash: string
    expires_at: Date
    attempts: number
  } | null>
  recordAttempt(id: string): Promise<void>
  consume(id: string): Promise<void>
}

export function drizzleOtpStore(db: AppDatabase): OtpStore {
  return {
    async countRecentByIdentifier(channel, identifier, since) {
      const rows = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(auth_otps)
        .where(
          and(
            eq(auth_otps.channel, channel),
            eq(auth_otps.identifier, identifier),
            gte(auth_otps.created_at, since),
          ),
        )
      return rows[0]?.n ?? 0
    },
    async countRecentByUser(user_id, since) {
      const rows = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(auth_otps)
        .where(and(eq(auth_otps.user_id, user_id), gte(auth_otps.created_at, since)))
      return rows[0]?.n ?? 0
    },
    async insert(row) {
      await db.insert(auth_otps).values(row)
    },
    async findActive(channel, identifier, user_id) {
      const rows = await db
        .select({
          id: auth_otps.id,
          code_hash: auth_otps.code_hash,
          expires_at: auth_otps.expires_at,
          attempts: auth_otps.attempts,
        })
        .from(auth_otps)
        .where(
          and(
            eq(auth_otps.channel, channel),
            eq(auth_otps.identifier, identifier),
            user_id === null ? isNull(auth_otps.user_id) : eq(auth_otps.user_id, user_id),
            isNull(auth_otps.consumed_at),
          ),
        )
        .orderBy(sql`${auth_otps.created_at} DESC`)
        .limit(1)
      return rows[0] ?? null
    },
    async recordAttempt(id) {
      await db
        .update(auth_otps)
        .set({ attempts: sql`${auth_otps.attempts} + 1` })
        .where(eq(auth_otps.id, id))
    },
    async consume(id) {
      await db.update(auth_otps).set({ consumed_at: new Date() }).where(eq(auth_otps.id, id))
    },
  }
}
