import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { escrows } from './escrow'
import { users } from './identity'
import { PLATFORM_CONFIG_DEFAULTS, MAX_PENDING_GIGS_CEILING } from '../../constants/platform'
import { ESCROW_LIMITS } from '../../constants/escrow'
import {
  MAX_OPEN_APPLICATIONS_CEILING,
  MIN_APPLICATION_TTL_SECONDS,
  MAX_APPLICATION_TTL_SECONDS,
} from '../../constants/applications'

export const disputeWinnerEnum = pgEnum('dispute_winner', [
  'creator',
  'counterparty',
  'split',
])

/**
 * Lifecycle of a proposed dispute resolution (Issue-3 propose→sign queue):
 *   pending    — a mediator recorded a verdict; awaiting a key-holder.
 *   executing  — a signer built the on-chain resolve tx and is signing it
 *                (set by the C2 wallet flow; reserved here so the enum needs
 *                no later ALTER).
 *   confirmed  — the DisputeResolved event applied on-chain; terminal.
 *   rejected   — a reviewer returned it; the mediator may propose again.
 */
export const resolutionStatusEnum = pgEnum('resolution_status', [
  'pending',
  'executing',
  'confirmed',
  'rejected',
])

export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    escrow_id: uuid('escrow_id')
      .notNull()
      .unique('disputes_escrow_id_uq')
      .references(() => escrows.id, { onDelete: 'cascade' }),
    raised_by: uuid('raised_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    // CO7 claim-based mediation: an admin claims a dispute from the open
    // pool (POST /admin/disputes/:id/claim) before mediating in its thread.
    // Null = unclaimed. Cleared by release; survives resolution for audit.
    assigned_to: uuid('assigned_to').references(() => users.id, { onDelete: 'restrict' }),
    assigned_at: timestamp('assigned_at'),
    winner: disputeWinnerEnum('winner'),
    resolved_by: uuid('resolved_by').references(() => users.id, { onDelete: 'restrict' }),
    resolved_at: timestamp('resolved_at'),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    // The unclaimed pool — the admin nav badge polls it every 30s per open tab
    // (?status=open&assigned=none), and the route runs a row query and a count
    // over the same filter in parallel, so `limit: 1` avoids neither.
    //
    // BOTH nulls belong in the predicate, and that is the measured part
    // (docs/query_plan_measurements.md). The obvious `WHERE resolved_at IS NULL`
    // is worse than having no index at all once the open queue is large: it
    // matches every unresolved dispute, heap-fetches all of them and then
    // discards the claimed ones on `assigned_to` — 0.678 ms against 0.534 ms
    // unindexed, on the same pages the seq scan already read. With `assigned_to`
    // in the predicate it is 0.047 ms and 14 buffers, in 16 kB.
    //
    // `created_at DESC` is here because the LIMIT 1 is not a limit without it.
    // With no ordered path Postgres has to join every match through five joins
    // and top-N sort them to return one row: on a backlogged queue that measured
    // 7,324 buffers and 8.0 ms warm (24.5 ms cold) against 15 buffers and
    // 0.058 ms indexed.
    //
    // `.nullsFirst()` is NOT decoration. Drizzle's bare `.desc()` emits
    // `DESC NULLS LAST`, while SQL's bare `ORDER BY x DESC` — what the route
    // writes — means DESC NULLS FIRST. Different pathkeys, so the index serves
    // the FILTER but not the ORDERING, and a top-N Sort node reappears above the
    // join: measured at 51 buffers / 0.208 ms against 14 / 0.062 ms, i.e. the
    // early-stop this index exists for is silently lost. `created_at` is NOT
    // NULL, so the two orderings can never actually differ in output — which is
    // exactly why this would have gone unnoticed.
    //
    // The cost, named rather than glossed: a partial index's PREDICATE columns
    // block HOT updates just as its key columns do (measured — 500/500 HOT
    // before, 0/500 after, on a table with room to spare). So claim, release
    // and resolve each write a new index entry and a non-HOT tuple where they
    // used to be in-page. On a table this size, and for actions a human takes
    // by hand, that is worth the 30s poll it buys.
    index('disputes_unclaimed_idx')
      .on(t.created_at.desc().nullsFirst())
      .where(sql`${t.resolved_at} IS NULL AND ${t.assigned_to} IS NULL`),
  ],
)

/**
 * Dispute-resolution proposals (Issue-3): decouples the mediator's verdict
 * from the on-chain signature. A mediator proposes an outcome (pending); a
 * key-holder later signs it on-chain (C2). Confirmation is stamped ONLY by
 * the verify-tx apply path (lib/escrow-events/store.ts) when DisputeResolved
 * lands — a proposal never resolves the dispute by itself, so an unsigned
 * proposal leaves the thread live.
 *
 * `threshold` is the number of approvals required to execute (1 at launch;
 * the multisig path raises it without a schema change). The partial unique
 * index enforces at most ONE active (pending|executing) proposal per dispute.
 */
export const dispute_resolutions = pgTable(
  'dispute_resolutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dispute_id: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    proposed_winner: disputeWinnerEnum('proposed_winner').notNull(),
    proposed_by: uuid('proposed_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: resolutionStatusEnum('status').notNull().default('pending'),
    threshold: integer('threshold').notNull().default(1),
    reject_reason: text('reject_reason'),
    rejected_by: uuid('rejected_by').references(() => users.id, { onDelete: 'restrict' }),
    /** On-chain ref that confirmed the resolution; set by the apply path. */
    resolved_tx_ref: text('resolved_tx_ref'),
    created_at: timestamp('created_at').notNull().defaultNow(),
    updated_at: timestamp('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('dispute_resolutions_dispute_idx').on(t.dispute_id),
    // At most one live proposal per dispute; rejected/confirmed rows are history.
    uniqueIndex('dispute_resolutions_active_uq')
      .on(t.dispute_id)
      .where(sql`${t.status} IN ('pending', 'executing')`),
    check('dispute_resolutions_threshold_positive_chk', sql`${t.threshold} >= 1`),
  ],
)

/**
 * CO7 mediation thread: ONE shared conversation per dispute — both escrow
 * parties and the mediating admin read/write the same messages (no
 * per-pair side channels). Thread goes read-only once the dispute is
 * resolved.
 */
export const dispute_messages = pgTable(
  'dispute_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dispute_id: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    sender_id: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    body: varchar('body', { length: 2000 }).notNull(),
    // Optional evidence attachment, mirroring chat messages. URL must live
    // under the dispute-scoped Cloudinary folder (validated at send). An
    // attachment-only message carries an empty body.
    attachment_url: text('attachment_url'),
    attachment_type: text('attachment_type', { enum: ['image', 'file'] }),
    attachment_size: integer('attachment_size'),
    // precision 3 (ms): the client's ?after cursor is this value round-
    // tripped through toISOString(), which carries milliseconds only —
    // µs-precision storage would re-include boundary rows on every poll.
    created_at: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (t) => [index('dispute_messages_dispute_idx').on(t.dispute_id, t.created_at)],
)

/**
 * CO8 featured listings: admin-curated, scheduled placements served as a
 * separate cached rail (GET /v1/gigs/featured) — never a boolean on
 * escrows, so the feed query stays untouched and a slot can be scheduled
 * ahead of time. A listing may hold multiple (even overlapping) slots;
 * the rail dedupes.
 */
export const featured_slots = pgTable(
  'featured_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    escrow_id: uuid('escrow_id')
      .notNull()
      .references(() => escrows.id, { onDelete: 'cascade' }),
    starts_at: timestamp('starts_at').notNull(),
    ends_at: timestamp('ends_at').notNull(),
    /** Lower renders first within the rail. */
    position: integer('position').notNull().default(0),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('featured_slots_window_idx').on(t.starts_at, t.ends_at),
    check('featured_slots_window_chk', sql`${t.ends_at} > ${t.starts_at}`),
  ],
)

/** Per-participant last-read pointer for a dispute thread (CO7). */
export const dispute_reads = pgTable(
  'dispute_reads',
  {
    dispute_id: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    last_read_at: timestamp('last_read_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.dispute_id, t.user_id] })],
)

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    escrow_id: uuid('escrow_id')
      .notNull()
      .references(() => escrows.id, { onDelete: 'cascade' }),
    reviewer_id: uuid('reviewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reviewee_id: uuid('reviewee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    score: integer('score').notNull(),
    comment: text('comment'),
    created_at: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('reviews_escrow_reviewer_uq').on(t.escrow_id, t.reviewer_id),
    check('reviews_score_range_chk', sql`${t.score} BETWEEN 1 AND 5`),
    check('reviews_reviewer_not_reviewee_chk', sql`${t.reviewer_id} <> ${t.reviewee_id}`),
  ],
)

// Singleton row enforced by `id = 1` CHECK.
export const platform_config = pgTable(
  'platform_config',
  {
    id: integer('id').primaryKey().default(1),
    fee_bps: integer('fee_bps').notNull().default(PLATFORM_CONFIG_DEFAULTS.fee_bps),
    seeker_fee_bps: integer('seeker_fee_bps').notNull().default(PLATFORM_CONFIG_DEFAULTS.seeker_fee_bps),
    grace_period_seconds: integer('grace_period_seconds')
      .notNull()
      .default(PLATFORM_CONFIG_DEFAULTS.grace_period_seconds),
    approval_window_seconds: integer('approval_window_seconds')
      .notNull()
      .default(PLATFORM_CONFIG_DEFAULTS.approval_window_seconds),
    default_sponsored_tx_count: integer('default_sponsored_tx_count')
      .notNull()
      .default(PLATFORM_CONFIG_DEFAULTS.default_sponsored_tx_count),
    moderation_rules_version: integer('moderation_rules_version')
      .notNull()
      .default(PLATFORM_CONFIG_DEFAULTS.moderation_rules_version),
    /** Gigs one worker may hold at once (features/capacity). */
    max_pending_gigs: integer('max_pending_gigs')
      .notNull()
      .default(PLATFORM_CONFIG_DEFAULTS.max_pending_gigs),
    /** Unassign window stamped onto approval-mode escrows at create. */
    unassign_window_seconds: integer('unassign_window_seconds')
      .notNull()
      .default(PLATFORM_CONFIG_DEFAULTS.unassign_window_seconds),
    /** Open applications one worker may hold at once (features/applications). */
    max_open_applications: integer('max_open_applications')
      .notNull()
      .default(PLATFORM_CONFIG_DEFAULTS.max_open_applications),
    /** How long a new application stays assignable. */
    application_ttl_seconds: integer('application_ttl_seconds')
      .notNull()
      .default(PLATFORM_CONFIG_DEFAULTS.application_ttl_seconds),
  },
  (t) => [
    check('platform_config_singleton_chk', sql`${t.id} = 1`),
    // Closes open issue D5. 10_000 bps = 100%.
    check(
      'platform_config_fee_bps_range_chk',
      sql`${t.fee_bps} BETWEEN 0 AND 10000 AND ${t.seeker_fee_bps} BETWEEN 0 AND 10000`,
    ),
    // 0 would lock every worker out of accepting; the ceiling keeps a typo
    // from silently disabling the cap.
    check(
      'platform_config_max_pending_gigs_range_chk',
      sql`${t.max_pending_gigs} BETWEEN 1 AND ${sql.raw(String(MAX_PENDING_GIGS_CEILING))}`,
    ),
    // Mirrors the bound BOTH contracts enforce, so a value the chain would
    // revert can never be stored — the column is the source the create route
    // stamps onto the escrow.
    // Same reasoning as max_pending_gigs: 0 would lock every worker out of
    // applying, and the ceiling keeps a typo from disabling the cap.
    check(
      'platform_config_max_open_applications_range_chk',
      sql`${t.max_open_applications} BETWEEN 1 AND ${sql.raw(String(MAX_OPEN_APPLICATIONS_CEILING))}`,
    ),
    check(
      'platform_config_application_ttl_range_chk',
      sql`${t.application_ttl_seconds} BETWEEN ${sql.raw(String(MIN_APPLICATION_TTL_SECONDS))} AND ${sql.raw(String(MAX_APPLICATION_TTL_SECONDS))}`,
    ),
    check(
      'platform_config_unassign_window_range_chk',
      sql`${t.unassign_window_seconds} BETWEEN ${sql.raw(String(ESCROW_LIMITS.minUnassignWindowSeconds))} AND ${sql.raw(String(ESCROW_LIMITS.maxUnassignWindowSeconds))}`,
    ),
  ],
)
