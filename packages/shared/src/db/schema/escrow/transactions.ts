/**
 * On-chain audit trail: one confirmed `escrow_transactions` row per applied
 * event, and the `tx_attempts` ledger the verify/reconcile pipeline works from.
 */

import { sql } from 'drizzle-orm'
import { boolean, check, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { escrows } from './escrows'
import { users } from '../identity'
import { chains } from '../chains'
import { escrowTxTypeEnum } from './enums'

export const escrow_transactions = pgTable(
  'escrow_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    escrow_id: uuid('escrow_id')
      .notNull()
      .references(() => escrows.id, { onDelete: 'cascade' }),
    type: escrowTxTypeEnum('type').notNull(),
    tx_ref: text('tx_ref').notNull().unique('escrow_transactions_tx_ref_uq'),
    /**
     * Chain-attested value moved TO THE COUNTERPARTY side of the row's
     * transition: net payout for approve/claim (amount − fee), the
     * counterparty's principal share for resolve, refund for cancel/expire/
     * reclaim (credited to the creator), bond for dispute. NULL when the
     * source event carried no amount.
     */
    amount_raw: numeric('amount_raw', { precision: 78, scale: 0 }),
    platform_fee_raw: numeric('platform_fee_raw', { precision: 78, scale: 0 }),
    /**
     * Resolve rows only: the CREATOR's principal share (a split pays both
     * sides, one column can't say who got what). NULL for every other type.
     */
    creator_payout_raw: numeric('creator_payout_raw', { precision: 78, scale: 0 }),
    actor_id: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('escrow_transactions_escrow_idx').on(t.escrow_id),
    index('escrow_transactions_created_at_idx').on(t.created_at),
  ],
)

// Client-side tx-submission audit log. Reconcile cron reads this. Replaces
// any notion of "in-flight" intermediate statuses on escrows.status.
export const tx_attempts = pgTable(
  'tx_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    escrow_id: uuid('escrow_id').references(() => escrows.id, { onDelete: 'cascade' }),
    action: escrowTxTypeEnum('action').notNull(),
    tx_ref: text('tx_ref').notNull().unique('tx_attempts_tx_ref_uq'),
    submitted_at: timestamp('submitted_at').notNull().defaultNow(),
    confirmed_at: timestamp('confirmed_at'),
    failed_at: timestamp('failed_at'),
    failure_code: text('failure_code'),
    // Set at reservation time by lib/sponsor.ts; verify-tx job reads this to
    // decide whether to commit the sponsored_tx_remaining decrement or
    // restore it on failure. See stage-0 § Sponsored-tx reservation pattern.
    was_sponsored: boolean('was_sponsored').notNull().default(false),
  },
  (t) => [
    index('tx_attempts_pending_idx')
      .on(t.submitted_at)
      .where(sql`${t.confirmed_at} IS NULL AND ${t.failed_at} IS NULL`),
    index('tx_attempts_user_idx').on(t.user_id),
  ],
)
