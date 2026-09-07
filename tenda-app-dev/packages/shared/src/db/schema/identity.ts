import { sql } from 'drizzle-orm'
import {
  boolean,
  doublePrecision,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { chainNamespacePgEnum, chains } from './chains'

export const userRoleEnum = pgEnum('user_role', [
  'user',
  'dispute_admin',
  'super_admin',
])

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended'])

/**
 * Login-credential kinds for `user_identities` (Stage 9). Wallet is NOT here
 * — it lives in `user_wallets` because it carries chain-specific structure
 * (chain_ns, one-primary index, gas-grant FK) AND is a transaction
 * capability, not just a credential. The login layer unions both tables via
 * `lib/auth/resolver.ts`. Adding a value here flows to the TS union.
 */
export const identityKindEnum = pgEnum('identity_kind', ['phone', 'email', 'google', 'apple'])

export type IdentityKind = (typeof identityKindEnum.enumValues)[number]

/** Runtime array for iteration / Set construction. Mirrors `IdentityKind`. */
export const identityKindValues: ReadonlyArray<IdentityKind> = identityKindEnum.enumValues

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    first_name: text('first_name').notNull().default(''),
    last_name: text('last_name').notNull().default(''),
    bio: text('bio'),
    avatar_url: text('avatar_url'),
    country: text('country'),
    city: text('city'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    // Stage 9A: phone moved to `user_identities` (kind='phone'). The public
    // "verified human" signal (phone_verified_at) is now derived by the read
    // routes from the verified phone identity, not stored here.
    role: userRoleEnum('role').notNull().default('user'),
    status: userStatusEnum('status').notNull().default('active'),
    is_seeker: boolean('is_seeker').notNull().default(false),
    /**
     * An autonomous agent's account (#19): born from a wallet proof at
     * POST /v1/agent/register, never from a phone/email. Public on purpose —
     * every surface that shows a poster shows this, so a human always knows
     * when the other side of an escrow is software. Exempt from the
     * verified-contact gate (no phone/email to verify); every other gate
     * (standing, wallet, moderation) applies unchanged.
     */
    is_agent: boolean('is_agent').notNull().default(false),
    review_score: numeric('review_score', { precision: 3, scale: 2 }),
    sponsored_tx_remaining: integer('sponsored_tx_remaining').notNull().default(3),
    advanced_mode_enabled: boolean('advanced_mode_enabled').notNull().default(false),
    // Broadcast read cursor: announcements published at/after this are unread.
    // NULL = never opened the notification centre (all active count as unread).
    announcements_read_at: timestamp('announcements_read_at', { withTimezone: true }),
    last_active_at: timestamp('last_active_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('users_country_idx').on(t.country),
    // The admin roster, for anything that asks "who holds this role?" —
    // the mediator lookup behind dispute alerts (features/alerts/recipients.ts),
    // role-targeted announcements (lib/announcements.ts), and the admin user
    // list's role filter.
    //
    // PARTIAL on purpose, and measured (docs/query_plan_measurements.md): at
    // 1M users the unindexed query is a PARALLEL seq scan reading 14,291
    // buffers (~112 MB) for 55.9 ms to return 13 rows — the wall time is the
    // smaller half, since that much churn evicts the cache out from under
    // whatever else is running. Indexed it is 3 buffers and 0.020 ms.
    //
    // The predicate is what makes it nearly free: almost every row is a plain
    // 'user' and never becomes an entry, so this is 16 kB where a full index
    // on the same column is 6,792 kB for identical timings, and an ordinary
    // signup or profile edit never touches it.
    index('users_role_idx').on(t.role).where(sql`${t.role} <> 'user'`),
  ],
)

export const user_wallets = pgTable(
  'user_wallets',
  {
    chain_ns: chainNamespacePgEnum('chain_ns').notNull(),
    address: text('address').notNull(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    is_primary: boolean('is_primary').notNull().default(false),
    verified_at: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.chain_ns, t.address] }),
    index('user_wallets_user_idx').on(t.user_id),
    uniqueIndex('user_wallets_one_primary_per_user_idx')
      .on(t.user_id)
      .where(sql`${t.is_primary} = true`),
    // THERE IS DELIBERATELY NO INDEX ON `address` ALONE (#118, dropped
    // 2026-08-22). S5.7 added one with the text_pattern_ops operator class for
    // an "admin wallet prefix search (LIKE 'abc%')" that was never written:
    // the admin user list matches ILIKE '%term%', and that opclass serves
    // neither a leading wildcard nor a case-insensitive operator.
    //
    // It was not merely unused, which is the trap — it took MORE scans than
    // this table's primary key, because the text_pattern_ops opfamily includes
    // `=` and the planner chose it as the entry point for plain
    // `address = $1` lookups. Every one of those is already covered by the
    // (chain_ns, address) primary key declared above, and measurably better:
    // with the index gone the Solana auth lookup improves from an Index Scan
    // plus heap fetch to an Index ONLY Scan. Plans in
    // docs/query_plan_measurements.md.
    //
    // Before re-adding anything here, note that the admin search's Seq Scan is
    // accepted on purpose, so the operator can paste a fragment from the MIDDLE
    // of an address. A prefix-only index cannot serve that search whatever its
    // opclass; a trigram (pg_trgm) index is the only thing that would, and that
    // is an extension dependency for every environment.
  ],
)

/**
 * Stage 9 login-credential registry. One row per (kind, identifier) →
 * exactly one user (UNIQUE). Holds phone, email, and OAuth (google/apple)
 * credentials; wallet stays in `user_wallets`. `email` carries the verified
 * address for any row that has one (kind='email' → equals identifier;
 * oauth → the provider's verified email claim; phone → null) so the login
 * orchestrator can enforce the cross-method invariant "a verified email maps
 * to exactly one user". `verified_at` is set when control was proven (OTP
 * confirm / OIDC token). NOT an authz source — `users.role` governs access.
 */
export const user_identities = pgTable(
  'user_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: identityKindEnum('kind').notNull(),
    /** Normalised unique key: E.164 phone | lowercased email | OAuth `sub`. */
    identifier: text('identifier').notNull(),
    /** Verified email when the credential yields one; null otherwise. */
    email: text('email'),
    verified_at: timestamp('verified_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_identities_kind_identifier_uq').on(t.kind, t.identifier),
    index('user_identities_user_idx').on(t.user_id),
    // Cross-method verified-email dedup lookup (kind-agnostic).
    index('user_identities_email_idx').on(t.email),
  ],
)

export const auth_nonces = pgTable(
  'auth_nonces',
  {
    nonce: text('nonce').primaryKey(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumed_at: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [index('auth_nonces_expires_idx').on(t.expires_at)],
)

/** Delivery channel for a consumer auth OTP (Stage 9 — phone SMS or email). */
export const otpChannelEnum = pgEnum('otp_channel', ['phone', 'email'])

export type OtpChannel = (typeof otpChannelEnum.enumValues)[number]

/** Runtime array for iteration. Mirrors `OtpChannel`. */
export const otpChannelValues: ReadonlyArray<OtpChannel> = otpChannelEnum.enumValues

/**
 * Consumer auth OTP (Stage 9 — generalises the former phone_otps to phone +
 * email; one lifecycle, one table). `identifier` is the E.164 phone or the
 * lowercased email. Pre-account-creation rows (passwordless first sign-in)
 * have user_id = null; authenticated link rows bind to the user. Admin
 * email_otps stays separate (it is admin-registry-scoped + user_id NOT NULL).
 */
export const auth_otps = pgTable(
  'auth_otps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: otpChannelEnum('channel').notNull(),
    identifier: text('identifier').notNull(),
    user_id: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    code_hash: text('code_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumed_at: timestamp('consumed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_otps_channel_identifier_idx').on(t.channel, t.identifier, t.created_at)],
)

/**
 * Admin-dashboard LOGIN REGISTRY — and nothing more (#84).
 *
 * INVARIANT (user-approved 2026-06-05): this table answers exactly one
 * question — "may a login email be sent for this account, and to which
 * address?" It is NEVER an authorization source: every permission check
 * reads `users.role` through ROLE_PERMISSIONS, and the OTP-verify route
 * re-checks role + status at verify time. A row here with a non-admin
 * `users.role` grants nothing. Likewise, a future optional `users.email`
 * profile column carries ZERO security weight — admin login email lives
 * here and only here.
 *
 * Email is stored lowercase (write sites normalise; the unique constraint
 * backstops case-collisions). Rows are provisioned via the ops grant
 * script (#85) or the super_admin surface (#87) and revoked in the same
 * transaction as a demotion to a non-admin role.
 */
export const admin_users = pgTable('admin_users', {
  user_id: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull().unique('admin_users_email_uq'),
  added_by: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Email OTP for admin-dashboard login (#84) — mirrors phone_otps, with one
// deliberate divergence: user_id is NOT NULL. Phone OTPs serve pre-signup
// verification (no user yet); email OTPs are only ever sent to registered
// admin_users rows, so the sender always knows the account.
export const email_otps = pgTable(
  'email_otps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code_hash: text('code_hash').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumed_at: timestamp('consumed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_otps_email_idx').on(t.email, t.created_at)],
)

// First-link native-gas seed grants. PRIMARY KEY (user_id, chain_id) keeps
// the grant idempotent across wallet rotations on the same chain.
export const gas_grants = pgTable(
  'gas_grants',
  {
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    chain_id: text('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'restrict' }),
    amount_raw: numeric('amount_raw', { precision: 78, scale: 0 }).notNull(),
    // UNIQUE so a retried insert with the same on-chain ref is rejected at
    // the DB layer — defence in depth on top of the (user_id, chain_id) PK.
    tx_ref: text('tx_ref').notNull().unique('gas_grants_tx_ref_uq'),
    granted_at: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.user_id, t.chain_id] }),
    index('gas_grants_chain_idx').on(t.chain_id),
  ],
)

