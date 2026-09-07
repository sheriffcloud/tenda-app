/**
 * Stage-6 moderation tables (stage-6-moderation.md § Database).
 *
 * Verdicts are append-only: an admin override creates a NEW approve
 * verdict; the original stays for audit. `category_price_stats` grounds
 * the price-sanity prompts and is rolled up nightly from completed
 * escrows. The legacy `blocked_keywords` table is deleted at cutover —
 * curated lists move into the feature module as code.
 *
 * NOTE: after editing run `pnpm --filter @tenda/shared build` and
 * `pnpm db:generate` (migrations are generated, never hand-written).
 */

import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './identity'

export const moderationDecisionEnum = pgEnum('moderation_decision', ['approve', 'warn', 'block'])

export type ModerationDecision = (typeof moderationDecisionEnum.enumValues)[number]

export const moderation_verdicts = pgTable(
  'moderation_verdicts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subject_kind: text('subject_kind', { enum: ['gig_draft', 'gig_published'] }).notNull(),
    subject_id: uuid('subject_id'),
    /** SHA-256 of the normalized payload — the cache key component. */
    input_hash: text('input_hash').notNull(),
    decision: moderationDecisionEnum('decision').notNull(),
    /** [{ code, message, severity }] */
    reasons: jsonb('reasons').notNull(),
    provider: text('provider', { enum: ['claude', 'keyword', 'openai', 'admin'] }).notNull(),
    model: text('model'),
    cost_usd: numeric('cost_usd', { precision: 10, scale: 6 }),
    latency_ms: integer('latency_ms'),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('moderation_verdicts_subject_idx').on(t.subject_kind, t.subject_id),
    index('moderation_verdicts_hash_idx').on(t.input_hash),
  ],
)

export const category_price_stats = pgTable(
  'category_price_stats',
  {
    category: text('category').notNull(),
    country: text('country').notNull(),
    asset: text('asset').notNull(),
    p10_amount_raw: numeric('p10_amount_raw', { precision: 78, scale: 0 }),
    p50_amount_raw: numeric('p50_amount_raw', { precision: 78, scale: 0 }),
    p90_amount_raw: numeric('p90_amount_raw', { precision: 78, scale: 0 }),
    sample_size: integer('sample_size').notNull(),
    updated_at: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.category, t.country, t.asset] })],
)

export const moderation_overrides = pgTable('moderation_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Null = applies to all categories / countries. */
  category: text('category'),
  country: text('country'),
  rule: text('rule').notNull(),
  value: text('value').notNull(),
  reason: text('reason'),
  created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at').notNull().defaultNow(),
})
