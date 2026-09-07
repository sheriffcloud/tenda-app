/**
 * Gig applications — the "raise your hand" satellite for approval-mode gigs.
 *
 * A poster assigns from these rows, and the assignment is what moves the
 * escrow on-chain. The row itself is settled by the EVENT APPLIER, never by
 * the route that builds the transaction: a signature the user abandons must
 * not burn their application.
 */

import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { escrows } from './escrows'
import { users } from '../identity'
import { applicationStatusEnum } from './enums'

export const gig_applications = pgTable(
  'gig_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    escrow_id: uuid('escrow_id')
      .notNull()
      .references(() => escrows.id, { onDelete: 'cascade' }),
    // RESTRICT mirrors escrows.creator_id: a user with application history is
    // soft-deleted, never hard-deleted out from under a poster's shortlist.
    applicant_id: uuid('applicant_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Optional pitch; length-checked against APPLICATION_MESSAGE_MAX_LENGTH. */
    message: text('message'),
    /**
     * The wallet the applicant chose to work under — the address an
     * `assign_accept` will BAKE into the on-chain escrow, validated at apply
     * time as one of the applicant's verified wallets on the gig's chain
     * namespace (an absent client choice records their primary). Null only on
     * rows that predate the column; the assign route then falls back to the
     * primary, exactly the pre-column behaviour.
     */
    wallet_address: text('wallet_address'),
    status: applicationStatusEnum('status').notNull().default('open'),
    /**
     * When this stops being assignable. Set from
     * `platform_config.application_ttl_seconds` at creation and extended by a
     * short hold when a poster starts an assignment (see
     * APPLICATION_ASSIGN_HOLD_SECONDS).
     */
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Re-applying to the same gig UPSERTS this row rather than stacking rows,
    // so a withdrawn applicant can change their mind without the poster seeing
    // duplicates and without a second slot being consumed.
    unique('gig_applications_escrow_applicant_uq').on(t.escrow_id, t.applicant_id),
    // The poster's shortlist: applicants on one gig, filtered to open.
    index('gig_applications_escrow_status_idx').on(t.escrow_id, t.status),
    // The worker's "My Applications" list + their open-application cap.
    index('gig_applications_applicant_status_idx').on(t.applicant_id, t.status),
    // The expiry sweep only ever scans open rows, so the index carries the
    // predicate — it stays small no matter how much settled history accrues.
    index('gig_applications_expiry_idx')
      .on(t.expires_at)
      .where(sql`${t.status} = 'open'`),
  ],
)
