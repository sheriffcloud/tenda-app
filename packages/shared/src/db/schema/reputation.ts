/**
 * Stage-7 reputation tables (stage-7-reputation.md § Database).
 *
 * `user_standing` holds cheap lifetime counters + the authoritative
 * restriction gate. Rolling-window stats are NOT denormalized — they are
 * computed on the fly from `standing_events` (the doc's "query function"
 * option), which `standing_events_user_idx` supports cheaply. Cooldowns
 * are absolute timestamps; expiry needs no decay job.
 *
 * NOTE: after editing this file run `pnpm --filter @tenda/shared build`
 * and `pnpm db:generate` (migrations are generated, never hand-written).
 */

import { sql } from 'drizzle-orm'
import { check, index, pgEnum, pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'
import { users } from './identity'
import { escrows } from './escrow'

export const restrictionKindEnum = pgEnum('restriction_kind', [
  'accept_cooldown',
  'create_cooldown',
  'dispute_cooldown',
  'manual_review',
])

export type RestrictionKind = (typeof restrictionKindEnum.enumValues)[number]

export const standingEventKindEnum = pgEnum('standing_event_kind', [
  'completed',
  'abandoned',
  'ghosted_approval',
  'disputed_won',
  'disputed_lost',
  'fraud_confirmed',
  'declined',
  'cancelled',
])

export type StandingEventKind = (typeof standingEventKindEnum.enumValues)[number]

export const user_standing = pgTable(
  'user_standing',
  {
    user_id: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Lifetime counters — cheap to bump per event, cheap to display.
    completed_count: integer('completed_count').notNull().default(0),
    abandoned_count: integer('abandoned_count').notNull().default(0),
    ghosted_count: integer('ghosted_count').notNull().default(0),
    disputed_won_count: integer('disputed_won_count').notNull().default(0),
    disputed_lost_count: integer('disputed_lost_count').notNull().default(0),
    fraud_confirmed_count: integer('fraud_confirmed_count').notNull().default(0),

    // Active restriction — the authoritative gate; middleware reads ONLY this.
    restriction_until: timestamp('restriction_until'),
    restriction_kind: restrictionKindEnum('restriction_kind'),
    restriction_reason: text('restriction_reason'),

    updated_at: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('user_standing_restriction_idx')
      .on(t.restriction_until)
      .where(sql`${t.restriction_until} IS NOT NULL`),
    // manual_review has no expiry; the time-bound kinds must carry one.
    check(
      'user_standing_restriction_paired_chk',
      sql`(${t.restriction_kind} IS NULL) = (${t.restriction_reason} IS NULL)`,
    ),
  ],
)

export const standing_events = pgTable(
  'standing_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    escrow_id: uuid('escrow_id').references(() => escrows.id, { onDelete: 'set null' }),
    kind: standingEventKindEnum('kind').notNull(),
    role: text('role', { enum: ['creator', 'counterparty'] }).notNull(),
    recorded_at: timestamp('recorded_at').notNull().defaultNow(),
  },
  (t) => [index('standing_events_user_idx').on(t.user_id, t.recorded_at)],
)

export const standing_overrides = pgTable('standing_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: text('action', {
    enum: ['lift_restriction', 'apply_restriction', 'reset_counters', 'mark_fraud'],
  }).notNull(),
  reason: text('reason').notNull(),
  applied_by: uuid('applied_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  applied_at: timestamp('applied_at').notNull().defaultNow(),
})
