/** Exchange satellite: the P2P fiat leg of a `kind='exchange'` escrow. */

import { integer, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { escrows } from './escrows'
import { bank_accounts } from '../fiat'

export const exchange_details = pgTable('exchange_details', {
  escrow_id: uuid('escrow_id')
    .primaryKey()
    .references(() => escrows.id, { onDelete: 'cascade' }),
  fiat_amount: numeric('fiat_amount', { precision: 20, scale: 4 }).notNull(),
  fiat_currency: varchar('fiat_currency', { length: 3 }).notNull(),
  rate: numeric('rate', { precision: 30, scale: 10 }).notNull(),
  payment_window_seconds: integer('payment_window_seconds').notNull(),
  payment_proof_url: text('payment_proof_url'),
  /**
   * The seller's payout account the accepted buyer pays fiat into. Nullable:
   * older offers predate it and a deleted account nulls out (set null) rather
   * than cascading the whole offer. Revealed only to the offer's parties.
   */
  payout_account_id: uuid('payout_account_id').references(() => bank_accounts.id, {
    onDelete: 'set null',
  }),
})
