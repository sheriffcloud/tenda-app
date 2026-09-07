import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { chains } from './chains'
import { users } from './identity'

// Polling-listener cursor only. Webhook listeners do NOT touch this table —
// dedup is via tx_ref uniqueness + BullMQ idempotency key.
export const chain_cursors = pgTable('chain_cursors', {
  chain_id: text('chain_id')
    .primaryKey()
    .references(() => chains.id),
  last_block: bigint('last_block', { mode: 'number' }).notNull().default(0),
  last_processed_at: timestamp('last_processed_at').notNull().defaultNow(),
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
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_admin_created_idx').on(t.admin_id, t.created_at),
    index('audit_log_target_idx').on(t.target_type, t.target_id),
    index('audit_log_created_at_idx').on(t.created_at),
  ],
)
