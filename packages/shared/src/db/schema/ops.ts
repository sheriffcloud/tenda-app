import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { chains } from './chains'
import { users } from './identity'

// Polling-listener cursor only. Webhook listeners do NOT touch this table —
// dedup is via tx_ref uniqueness + BullMQ idempotency key.
export const chain_cursors = pgTable('chain_cursors', {
  chain_id: text('chain_id')
    .primaryKey()
    .references(() => chains.id),
  /**
   * The LIVE scan position: everything up to here, near the chain head, has
   * been scanned. This is the cursor that bounds how stale the app can be.
   */
  last_block: bigint('last_block', { mode: 'number' }).notNull().default(0),
  /**
   * The HISTORY scan position, walking forward from the contract's deploy
   * block toward `last_block` (#35).
   *
   * Two positions because one cursor forced a choice between them, and it
   * chose wrong: starting at the deploy block it walked forward oldest-first,
   * so on a fast chain it spent HOURS scanning history while live escrows went
   * unseen — measured on Galileo at 287,832 blocks behind head, with a real
   * accept sitting unnoticed in a block the cursor had not reached. Splitting
   * the two lets the live scan stay one tick behind head from the first tick,
   * while history closes the gap behind it at whatever budget is left.
   *
   * Equal to or past `last_block` means history is complete and the listener
   * is back to a single moving cursor.
   *
   * NULLABLE, and NULL is load bearing: it means "this row predates the
   * two-cursor scheme", which is the listener's cue to adopt whatever single
   * cursor the deployment already had. It cannot be a `0` sentinel over a
   * NOT NULL column, because 0 is also a LEGITIMATE value — a chain whose
   * history starts at block 1 has scanned nothing when it stores `1 - 1`. With
   * the two meanings collapsed, a history scan that could not advance past its
   * first block re-triggered adoption on the next tick and the whole span was
   * declared covered. MEASURED: blocks 1..100 became unreachable after one
   * transient enqueue failure.
   */
  backfill_block: bigint('backfill_block', { mode: 'number' }),
  last_processed_at: timestamp('last_processed_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Carry-forward admin action trail (#34 cutover). One delta vs legacy: the
 * `admin_wallet` column is dropped — v2 users are multi-wallet (decision
 * #13), so the durable identity is `admin_id` + `admin_role`; admin account
 * deletion is itself an audited admin action.
 */
export const admin_audit_log = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // admin_id nulls out if the admin account is deleted — the row survives.
    admin_id: uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
    admin_role: text('admin_role').notNull(),
    action: text('action').notNull(),
    target_type: text('target_type'),
    target_id: text('target_id'),
    metadata: jsonb('metadata'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_admin_created_idx').on(t.admin_id, t.created_at),
    index('audit_log_target_idx').on(t.target_type, t.target_id),
    index('audit_log_created_at_idx').on(t.created_at),
  ],
)
