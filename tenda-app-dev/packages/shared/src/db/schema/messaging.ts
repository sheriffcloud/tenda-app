/**
 * Carry-forward messaging + comms tables (stage-0-foundation.md § Database:
 * "conversations, messages, device_tokens, subscriptions, announcements:
 * carry forward unchanged from current schema (drop chain-specific FKs
 * where any)").
 *
 * Copied from the legacy schema at Stage 0 cutover (#34) with two
 * deliberate deltas:
 *   - `messages.gig_id` / `messages.offer_id` collapse into a single
 *     `escrow_id` — gigs and exchanges are both escrows in v2, and the
 *     chat context divider only needs one reference.
 *   - timestamps are `timestamptz`, matching every other table in this
 *     schema, and `updated_at` columns gain the v2 `$onUpdate` auto-bump.
 *     They were NAIVE until 2026-08-25 (`0033_sloppy_boomerang`): a bare
 *     `timestamp` carries no zone, so postgres.js parses it with
 *     `new Date(str)` — local time in whichever process reads it — and the
 *     DB session's zone had to match the API container's or every instant
 *     silently shifted. `packages/shared/test/db/timestamptz.test.ts` is
 *     what keeps a naive column from coming back.
 *
 * NOTE: after editing run `pnpm --filter @tenda/shared build` and
 * `pnpm db:generate` (migrations are generated, never hand-written).
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import {
  ANNOUNCEMENT_TARGETS,
  NOTIFICATION_TITLE_MAX,
  NOTIFICATION_BODY_MAX,
} from '../../constants/notifications'
import { escrows } from './escrow'
import { users } from './identity'

export const conversationStatusEnum = pgEnum('conversation_status', ['active', 'closed'])

/** Expo today; fcm/apns delivery added in Stage 5 (S5.1). */
export const devicePlatformEnum = pgEnum('device_platform', ['expo', 'fcm', 'apns'])

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Canonical order: user_a_id < user_b_id (enforced in application layer)
    user_a_id: uuid('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    user_b_id: uuid('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: conversationStatusEnum('status').notNull().default('active'),
    closed_by: uuid('closed_by').references(() => users.id),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    last_message_at: timestamp('last_message_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('conversations_user_pair_unique').on(t.user_a_id, t.user_b_id),
    index('conversations_user_a_idx').on(t.user_a_id),
    index('conversations_user_b_idx').on(t.user_b_id),
    // S5.7 (closes open 86): inbox ordering — list a user's conversations
    // newest-message-first without a sort node.
    index('conversations_user_a_last_msg_idx').on(t.user_a_id, t.last_message_at.desc()),
    index('conversations_user_b_last_msg_idx').on(t.user_b_id, t.last_message_at.desc()),
  ],
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversation_id: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    sender_id: uuid('sender_id')
      .notNull()
      .references(() => users.id),
    // Chat context divider: "discussing escrow X" (gig or exchange alike).
    escrow_id: uuid('escrow_id').references(() => escrows.id, { onDelete: 'set null' }),
    content: varchar('content', { length: 2000 }).notNull(),
    // S5.2 (closes open #85): optional chat attachment. URL must live under
    // the conversation-scoped Cloudinary folder (validated at send).
    attachment_url: text('attachment_url'),
    attachment_type: text('attachment_type', { enum: ['image', 'file'] }),
    attachment_size: integer('attachment_size'),
    read_at: timestamp('read_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Composite index covers the paginated history query:
    // WHERE conversation_id = X ORDER BY created_at DESC [LIMIT n]
    index('messages_conversation_created_at_idx').on(t.conversation_id, t.created_at),
    index('messages_sender_id_idx').on(t.sender_id),
    // Partial index for unread-count queries and mark-as-read UPDATE
    index('messages_unread_idx')
      .on(t.conversation_id, t.sender_id)
      .where(sql`${t.read_at} IS NULL`),
  ],
)

export const device_tokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: devicePlatformEnum('platform').notNull().default('expo'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('device_tokens_token_unique').on(t.token),
    index('device_tokens_user_id_idx').on(t.user_id),
  ],
)

export const gig_subscriptions = pgTable(
  'gig_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // '*' means any city/category (sentinel instead of NULL to enable UNIQUE constraint)
    city: text('city').notNull().default('*'),
    category: text('category').notNull().default('*'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('gig_subscriptions_unique').on(t.user_id, t.city, t.category),
    index('gig_subscriptions_user_id_idx').on(t.user_id),
    // Covers the fan-out query: WHERE city IN (data.city, '*') — filters by city first,
    // then category, avoiding a full-table scan as subscriber count grows.
    index('gig_subscriptions_city_category_idx').on(t.city, t.category),
  ],
)

/**
 * Personal in-app notifications (notification centre). One row per recipient
 * for TARGETED notices (escrow lifecycle, reviews, fiat, disputes, new-gig
 * matches); broadcasts do NOT fan out here — they live once in `announcements`
 * and merge in at read time. Chat is excluded (it has its own read surface).
 *
 * `id` is stamped by the enqueue helper (lib/notify.ts) so it is stable across
 * BullMQ retries → the delivery worker inserts with onConflictDoNothing and
 * persistence is idempotent. Deliberately NO defaultRandom: an omitted id is a
 * bug the insert type should catch, not paper over with a fresh random id.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: NOTIFICATION_TITLE_MAX }).notNull(),
    body: varchar('body', { length: NOTIFICATION_BODY_MAX }).notNull(),
    // Deep-link params ({ screen, escrowId, kind, ... }); null = non-routable.
    data: jsonb('data').$type<Record<string, string>>(),
    read_at: timestamp('read_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Feed query: WHERE user_id = X ORDER BY created_at DESC (cursor-paginated).
    index('notifications_user_created_idx').on(t.user_id, t.created_at.desc()),
    // Partial index for the unread-count badge and mark-all-read UPDATE.
    index('notifications_user_unread_idx')
      .on(t.user_id)
      .where(sql`${t.read_at} IS NULL`),
  ],
)

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 200 }).notNull(),
    body: varchar('body', { length: 2000 }).notNull(),
    // priority: higher = shown first. 0 = normal, 1 = important, 2 = urgent.
    priority: integer('priority').notNull().default(0),
    // Audience: NULL target = everyone; a non-null target requires target_value
    // (role name / country code / city name). Evaluated against the viewer at
    // read time (fan-out-on-read) so a broadcast is one row, never N.
    target: text('target', { enum: ANNOUNCEMENT_TARGETS }),
    target_value: text('target_value'),
    is_active: boolean('is_active').notNull().default(true),
    // published_at: set when first made active (set once, never cleared).
    published_at: timestamp('published_at', { withTimezone: true }),
    // expires_at: null = never expires.
    expires_at: timestamp('expires_at', { withTimezone: true }),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Public feed query: WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY priority DESC
    index('announcements_active_priority_idx').on(t.is_active, t.priority),
    index('announcements_expires_at_idx').on(t.expires_at),
  ],
)
