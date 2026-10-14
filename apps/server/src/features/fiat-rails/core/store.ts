/**
 * Fiat-rails persistence seam + drizzle implementation. Status writes are
 * guarded (`whereStatus`) so webhook replays / reconcile races can't
 * regress a settled intent.
 */

import { and, eq, inArray, lt, ne, sql } from 'drizzle-orm'
import { fiat_intents, bank_accounts } from '@tenda/shared/db/schema/fiat'
import type { PayoutRailKindDb } from '@tenda/shared/db/schema/fiat'
import { P2P_PROVIDER_ID } from '@tenda/shared'
import type { AppDatabase } from '@server/plugins/db'
import type { FiatIntentRow, FiatIntentStatus, FiatDirection } from './types'

/**
 * Statuses the reconcile/expiry jobs consider "open". Quotes are no longer a
 * Postgres status (they live in the Redis quote cache with a native TTL), so
 * 'quoted' is intentionally absent — the first persisted status is awaiting_*.
 */
export const OPEN_STATUSES: readonly FiatIntentStatus[] = [
  'awaiting_user',
  'awaiting_provider',
  'settling',
]

export interface NewFiatIntent {
  /** Explicit PK, reused from the quote so intent_id is stable across commit. */
  id: string
  direction: FiatDirection
  user_id: string
  wallet_address: string
  chain_id: string
  provider: string
  fiat_currency: string
  fiat_amount: string
  asset: string
  asset_amount_raw: string
  rate: string
  fee_amount: string
  status: FiatIntentStatus
  provider_ref: string | null
  kyc_required: boolean
  kyc_url: string | null
  expires_at: Date
  metadata: unknown
}

export interface IntentPatch {
  status?: FiatIntentStatus
  provider_ref?: string
  kyc_url?: string | null
  metadata?: unknown
}

export interface FiatStore {
  insertIntent(row: NewFiatIntent): Promise<FiatIntentRow>
  getIntent(id: string): Promise<FiatIntentRow | null>
  getIntentByProviderRef(provider: string, provider_ref: string): Promise<FiatIntentRow | null>
  listIntentsByUser(user_id: string, limit: number): Promise<FiatIntentRow[]>
  /**
   * Status-guarded patch: applies only while the row is in one of
   * `from`. Returns the updated row or null when the guard missed
   * (concurrent transition, caller treats as already-handled).
   */
  transition(id: string, from: readonly FiatIntentStatus[], patch: IntentPatch): Promise<FiatIntentRow | null>
  /** Open intents older than `olderThan`, reconcile candidates. */
  listStaleOpen(olderThan: Date, limit: number): Promise<FiatIntentRow[]>
  /**
   * awaiting_user intents whose quote window elapsed before `now` (a licensed
   * provider's deposit instruction going stale). Pre-commit quote expiry is
   * now the Redis TTL's job, so this no longer scans 'quoted'.
   */
  listExpiredAwaitingUser(now: Date, limit: number): Promise<FiatIntentRow[]>
}

export function drizzleFiatStore(db: AppDatabase): FiatStore {
  return {
    async insertIntent(row) {
      const [inserted] = await db.insert(fiat_intents).values(row).returning()
      return inserted as FiatIntentRow
    },

    async getIntent(id) {
      const [row] = await db.select().from(fiat_intents).where(eq(fiat_intents.id, id)).limit(1)
      return (row as FiatIntentRow | undefined) ?? null
    },

    async getIntentByProviderRef(provider, provider_ref) {
      const [row] = await db
        .select()
        .from(fiat_intents)
        .where(and(eq(fiat_intents.provider, provider), eq(fiat_intents.provider_ref, provider_ref)))
        .limit(1)
      return (row as FiatIntentRow | undefined) ?? null
    },

    async listIntentsByUser(user_id, limit) {
      const rows = await db
        .select()
        .from(fiat_intents)
        .where(eq(fiat_intents.user_id, user_id))
        .orderBy(sql`${fiat_intents.created_at} DESC`)
        .limit(limit)
      return rows as FiatIntentRow[]
    },

    async transition(id, from, patch) {
      const [row] = await db
        .update(fiat_intents)
        .set(patch)
        .where(and(eq(fiat_intents.id, id), inArray(fiat_intents.status, [...from])))
        .returning()
      return (row as FiatIntentRow | undefined) ?? null
    },

    async listStaleOpen(olderThan, limit) {
      const rows = await db
        .select()
        .from(fiat_intents)
        .where(
          and(
            inArray(fiat_intents.status, [...OPEN_STATUSES]),
            lt(fiat_intents.updated_at, olderThan),
          ),
        )
        .orderBy(fiat_intents.updated_at)
        .limit(limit)
      return rows as FiatIntentRow[]
    },

    async listExpiredAwaitingUser(now, limit) {
      const rows = await db
        .select()
        .from(fiat_intents)
        .where(
          and(
            eq(fiat_intents.status, 'awaiting_user'),
            lt(fiat_intents.expires_at, now),
            // A P2P offer, once OPENED (awaiting_user), is governed by the
            // offer's own accept_deadline + reconcile via provider.status —
            // NOT the 10-min quote TTL. Expiring it here fired a false
            // "cash-out failed, quote expired" push while the published offer
            // was still live. Only licensed-provider deposit instructions
            // (non-p2p) expire on the quote window here.
            ne(fiat_intents.provider, P2P_PROVIDER_ID),
          ),
        )
        .orderBy(fiat_intents.expires_at)
        .limit(limit)
      return rows as FiatIntentRow[]
    },
  }
}

// ---------- bank accounts -----------------------------------------------------

export interface BankAccountRow {
  id: string
  user_id: string
  country: string
  kind: PayoutRailKindDb
  bank_code: string
  account_number: string
  account_name: string
  is_default: boolean
  verified_at: Date | null
  created_at: Date
}

export interface BankAccountStore {
  list(user_id: string): Promise<BankAccountRow[]>
  get(user_id: string, id: string): Promise<BankAccountRow | null>
  insert(row: {
    user_id: string
    country: string
    kind: PayoutRailKindDb
    bank_code: string
    account_number: string
    account_name: string
    is_default: boolean
    verified_at: Date | null
  }): Promise<BankAccountRow>
  remove(user_id: string, id: string): Promise<boolean>
}

export function drizzleBankAccountStore(db: AppDatabase): BankAccountStore {
  return {
    async list(user_id) {
      const rows = await db
        .select()
        .from(bank_accounts)
        .where(eq(bank_accounts.user_id, user_id))
        .orderBy(sql`${bank_accounts.created_at} DESC`)
      return rows as BankAccountRow[]
    },

    async get(user_id, id) {
      const [row] = await db
        .select()
        .from(bank_accounts)
        .where(and(eq(bank_accounts.id, id), eq(bank_accounts.user_id, user_id)))
        .limit(1)
      return (row as BankAccountRow | undefined) ?? null
    },

    async insert(row) {
      const [inserted] = await db.insert(bank_accounts).values(row).returning()
      return inserted as BankAccountRow
    },

    async remove(user_id, id) {
      const rows = await db
        .delete(bank_accounts)
        .where(and(eq(bank_accounts.id, id), eq(bank_accounts.user_id, user_id)))
        .returning({ id: bank_accounts.id })
      return rows.length > 0
    },
  }
}
