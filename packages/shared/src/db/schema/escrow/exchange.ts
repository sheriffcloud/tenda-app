/** Exchange satellite: the P2P fiat leg of a `kind='exchange'` escrow. */

import { check, foreignKey, integer, numeric, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { escrows } from './escrows'
import { escrowKindEnum } from './enums'
import { bank_accounts } from '../fiat'

export const exchange_details = pgTable(
  'exchange_details',
  {
    escrow_id: uuid('escrow_id')
      .primaryKey()
      .references(() => escrows.id, { onDelete: 'cascade' }),
    /**
     * Always 'exchange'. Not data: it is the second half of the (escrow_id, kind)
     * foreign key below, which is how the database refuses an offer's fiat leg on a
     * gig escrow. Defaulted, so no writer sets it, and never selected onto the wire.
     */
    kind: escrowKindEnum('kind').notNull().default('exchange'),
    fiat_amount: numeric('fiat_amount', { precision: 20, scale: 4 }).notNull(),
    fiat_currency: varchar('fiat_currency', { length: 3 }).notNull(),
    rate: numeric('rate', { precision: 30, scale: 10 }).notNull(),
    payment_window_seconds: integer('payment_window_seconds').notNull(),
    payment_proof_url: text('payment_proof_url'),
    /**
     * The seller's payout account the accepted buyer pays fiat into. Nullable:
     * older offers predate it and a deleted account nulls out (set null) rather
     * than cascading the whole offer. Revealed only to the offer's settled parties.
     */
    payout_account_id: uuid('payout_account_id').references(() => bank_accounts.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    // The twin of gig_details_kind_chk / gig_details_escrow_kind_fk: an exchange leg
    // exists only beside a kind='exchange' escrow, so a gig can never carry one.
    check('exchange_details_kind_chk', sql`${t.kind} = 'exchange'`),
    foreignKey({
      name: 'exchange_details_escrow_kind_fk',
      columns: [t.escrow_id, t.kind],
      foreignColumns: [escrows.id, escrows.kind],
    }).onUpdate('restrict').onDelete('cascade'),
  ],
)
