/**
 * Carry-forward user-flagging table (stage-0-foundation.md § Database:
 * "reports: carry forward unchanged"). User reports are a distinct concern
 * from Stage-6 LLM moderation (pre-publish verdicts) — reports flag content
 * that is already live.
 *
 * One deliberate delta vs legacy: the `'gig'` content type becomes
 * `'escrow'` — reported listings are escrows (gig or exchange) in v2.
 *
 * NOTE: after editing run `pnpm --filter @tenda/shared build` and
 * `pnpm db:generate` (migrations are generated, never hand-written).
 */

import { index, pgEnum, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './identity'

export const reportContentTypeEnum = pgEnum('report_content_type', [
  'escrow',
  'message',
  'user',
  'review',
])
export const reportReasonEnum = pgEnum('report_reason', [
  'spam',
  'harassment',
  'inappropriate',
  'fraud',
  'other',
])
export const reportStatusEnum = pgEnum('report_status', [
  'pending',
  'reviewed',
  'actioned',
  'dismissed',
])

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporter_id: uuid('reporter_id')
      .notNull()
      .references(() => users.id),
    // reported_user_id: derived server-side from content_type + content_id — never trusted from client
    reported_user_id: uuid('reported_user_id')
      .notNull()
      .references(() => users.id),
    content_type: reportContentTypeEnum('content_type').notNull(),
    content_id: uuid('content_id').notNull(),
    reason: reportReasonEnum('reason').notNull(),
    note: varchar('note', { length: 500 }), // optional context from reporter
    content_snapshot: varchar('content_snapshot', { length: 2000 }), // text at time of report for offline review
    status: reportStatusEnum('status').notNull().default('pending'),
    admin_note: varchar('admin_note', { length: 1000 }),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One report per user per piece of content — prevents spam reports and is naturally idempotent
    unique('reports_reporter_content_unique').on(t.reporter_id, t.content_type, t.content_id),
    // Admin review queue indexes
    index('reports_status_idx').on(t.status),
    index('reports_content_type_status_idx').on(t.content_type, t.status),
    index('reports_content_id_idx').on(t.content_id),
    // S5.7 (closes open 87): report queue is sorted newest-first.
    index('reports_created_at_idx').on(t.created_at.desc()),
    index('reports_reported_user_id_idx').on(t.reported_user_id),
  ],
)
