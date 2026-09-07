# Tenda Admin — Implementation Plan

> **STATUS: IMPLEMENTED** (#84–#93, 2026-06) — the admin backend + dashboard
> shipped per this plan; `apps/admin/README.md` documents the built system.
> Retained as the design reference (role system, mediation Option B rationale).
> Where this document and the code disagree, the code is right.
>
> Reference document. Cross-references `open_issues.md` where relevant.
> **Rev 3** — incorporates findings from second review pass (50 total issues resolved: Rev 2 had 27, Rev 3 adds 23 more [Fix #28–#50]).

---

## Table of Contents

1. [Scope & Decisions](#1-scope--decisions)
2. [Role System](#2-role-system)
3. [Database Schema Changes](#3-database-schema-changes)
4. [Admin Backend — New Routes](#4-admin-backend--new-routes)
5. [Dispute Mediation — Option B](#5-dispute-mediation--option-b)
6. [Admin Frontend — Stack & Structure](#6-admin-frontend--stack--structure)
7. [Admin UI — Pages & Components](#7-admin-ui--pages--components)
8. [Mobile Changes](#8-mobile-changes)
9. [On-chain Admin Actions](#9-on-chain-admin-actions)
10. [Airdrop / Giveaway System](#10-airdrop--giveaway-system)
11. [Audit Log](#11-audit-log)
12. [Implementation Phases](#12-implementation-phases)
13. [Open Questions](#13-open-questions)

---

## 1. Scope & Decisions

### Decided
- **Admin frontend**: `apps/admin` — Next.js (App Router) + shadcn/ui, lives in the monorepo
- **Admin backend**: extend existing Fastify server with new routes under `/v1/admin/`; no separate service
- **Dispute mediation**: Option B — 3-party async thread (new tables, existing push infrastructure, polling consistent with current chat pattern); migrate to WebSocket when E4 is addressed
- **Role system**: expand from binary `user | admin` to a granular enum (see section 2)
- **On-chain actions from admin panel**: Solana wallet adapter in browser (`@solana/wallet-adapter-react`); dispute resolver and airdrop roles sign transactions in-browser

### Out of scope for now
- WebSocket / real-time mediation (revisit when E4 is tackled)
- Full analytics dashboard (basic metrics only in Phase 1)
- APNs/FCM migration (issue 84 — keep Expo push)
- Dispute bond enforcement (issue 82 — separate Anchor contract change)

---

## 2. Role System

### Current state
`users.role` is `text` with values `'user' | 'admin'`. Single admin level, no granularity.

### New enum

```
'user'
'super_admin'
'dispute_resolver'
'support'
'moderator'
'marketing'
'airdrop'
'finance'
```

### Migration
- Add new enum values to `users.role` column (Drizzle migration + Postgres `ALTER TYPE`)
- Existing `'admin'` rows → `'super_admin'` in the migration: `UPDATE users SET role = 'super_admin' WHERE role = 'admin'`
- `UserRole` type in `@tenda/shared` updated accordingly
- **[Fix #2]** The `requireRole` guard currently does an exact string match (`role !== role`). Change its signature to `requireRole(...roles: AdminRole[])` and check `roles.includes(request.user.role)`. During the migration window, the guard must also accept the legacy value `'admin'` as equivalent to `'super_admin'` to handle in-flight JWTs (7-day expiry). Remove the alias after one token lifetime.
- **[Fix #2 cont.]** Force-log out all active admin sessions at migration time by rotating the JWT secret briefly, or communicate to all admins to re-login before the migration goes live. Document this in the deployment runbook.
- **[Fix #3]** After Phase 1, demoted admins retain their old role in their JWT until expiry (up to 7 days). The `authenticate` decorator's DB cache hit currently only refreshes `status`, not `role`. Extend the cache entry to also store `role` and refresh it on cache miss. The `requireRole` guard then reads `request.user.role` but validates it against the cached DB role — not solely the JWT claim. Tracked in `open_issues.md` as A2.
- **[Fix #38]** When `PATCH /admin/users/:id/role` demotes a `dispute_resolver` to any non-admin role, the route must also set `assigned_to = NULL` on all open `dispute_threads` where `assigned_to = that user's id`. Without this, those threads are permanently "assigned" to someone who can no longer act. A `super_admin` must then manually reassign each one. Run as part of the same DB transaction as the role update.

### Role permissions matrix

| Capability | super_admin | dispute_resolver | support | moderator | marketing | airdrop | finance |
|---|---|---|---|---|---|---|---|
| View all users (PII) | ✓ | ✓ | ✓ | ✓ | — | — | — |
| View user aggregates only | — | — | — | — | ✓ | — | ✓ |
| Suspend / reinstate user | ✓ | — | ✓ | ✓ | — | — | — |
| Promote / demote roles | ✓ | — | — | — | — | — | — |
| View all gigs | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Force-expire / hide gig | ✓ | — | ✓ | ✓ | — | — | — |
| View all disputes | ✓ | ✓ | ✓ | — | — | — | — |
| Write to dispute thread | ✓ | ✓ | — | — | — | — | — |
| Resolve dispute on-chain | ✓ | ✓ | — | — | — | — | — |
| Manage blocked keywords | ✓ | — | — | ✓ | — | — | — |
| Action reports | ✓ | — | ✓ | ✓ | — | — | — |
| Platform config (fees) | ✓ | — | — | — | — | — | — |
| Push broadcasts | ✓ | — | — | — | ✓ | — | — |
| Feature gigs / banners | ✓ | — | — | — | ✓ | — | — |
| Configure airdrops | ✓ | — | — | — | — | ✓ | — |
| Execute airdrop on-chain | ✓ | — | — | — | — | ✓ | — |
| View financial metrics | ✓ | — | — | — | — | — | ✓ |

> **[Fix #23]** `marketing` and `finance` roles were originally granted "View all users" (PII). This is excess privilege. Marketing needs aggregate segment sizes (e.g., "users in Nigeria: 4 200") via `GET /admin/metrics`; finance needs aggregate fee totals. Neither role should access the `GET /admin/users` endpoint or individual user records.

---

## 3. Database Schema Changes

All changes go in `packages/shared/src/db/schema.ts` and require Drizzle migrations.

### 3.1 `users` table — role column

```ts
// Change from:
role: text('role').notNull().default('user')
// To:
role: text('role', {
  enum: ['user', 'super_admin', 'dispute_resolver', 'support', 'moderator', 'marketing', 'airdrop', 'finance']
}).notNull().default('user')
```

Also add index for admin user lookup:
```ts
// [Fix #26] — prefix search on wallet_address requires text_pattern_ops index
// Add to migration SQL (Drizzle doesn't support text_pattern_ops directly):
// CREATE INDEX users_wallet_prefix_idx ON users (wallet_address text_pattern_ops);
```

### 3.2 `dispute_threads` table (new)

**[Fix #1]** The schema originally used a single `dispute_id` FK to the `disputes` table. This is wrong — `exchange_disputes` is a completely separate table with its own PK. Use two nullable FKs with a check constraint.

```ts
export const dispute_threads = pgTable('dispute_threads', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  // Exactly one of these two must be non-null (enforced by check constraint below)
  gig_dispute_id:      uuid('gig_dispute_id').references(() => disputes.id),
  exchange_dispute_id: uuid('exchange_dispute_id').references(() => exchange_disputes.id),
  assigned_to:         uuid('assigned_to').references(() => users.id), // [Fix #9] which resolver owns this
  created_by:          uuid('created_by').notNull().references(() => users.id),
  // [Fix #25] track whether parties have seen the latest message
  // [Fix #30] renamed from poster/worker to party_a/party_b — correct for both gig (poster=A, worker=B)
  //           and exchange disputes (seller=A, buyer=B)
  party_a_last_read_at: timestamp('party_a_last_read_at', { withTimezone: true }),
  party_b_last_read_at: timestamp('party_b_last_read_at', { withTimezone: true }),
  closed_at:           timestamp('closed_at', { withTimezone: true }),
  created_at:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One thread per gig dispute
  gig_dispute_unique:      uniqueIndex('dt_gig_dispute_unique').on(t.gig_dispute_id),
  // One thread per exchange dispute
  exchange_dispute_unique: uniqueIndex('dt_exchange_dispute_unique').on(t.exchange_dispute_id),
}))
```

Add check constraint in migration SQL (Drizzle check constraints on nullable columns require raw SQL):
```sql
ALTER TABLE dispute_threads
  ADD CONSTRAINT dt_exactly_one_dispute
  CHECK (
    (gig_dispute_id IS NOT NULL AND exchange_dispute_id IS NULL) OR
    (gig_dispute_id IS NULL AND exchange_dispute_id IS NOT NULL)
  );
```

### 3.3 `dispute_messages` table (new)

```ts
export const dispute_messages = pgTable('dispute_messages', {
  id:           uuid('id').primaryKey().defaultRandom(),
  thread_id:    uuid('thread_id').notNull().references(() => dispute_threads.id),
  sender_id:    uuid('sender_id').notNull().references(() => users.id),
  sender_role:  text('sender_role', {
                  enum: ['admin', 'poster', 'worker', 'buyer', 'seller']
                }).notNull(),
  body:         text('body').notNull(), // [Fix #20] validate max 5 000 chars at server layer
  created_at:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Indexes:
- `(thread_id, created_at DESC)` — primary read pattern (covering index)

### 3.4 `admin_audit_log` table (new)

**[Fix #10]** Original FK used default `RESTRICT` — blocking future account deletion and losing admin identity. Use `SET NULL` and store `admin_wallet` at write time.

```ts
export const admin_audit_log = pgTable('admin_audit_log', {
  id:           uuid('id').primaryKey().defaultRandom(),
  admin_id:     uuid('admin_id').references(() => users.id, { onDelete: 'set null' }),
  admin_wallet: text('admin_wallet').notNull(), // preserved even if account is deleted
  admin_role:   text('admin_role').notNull(),
  action:       text('action').notNull(),
  target_type:  text('target_type'),
  target_id:    text('target_id'),
  metadata:     jsonb('metadata'),
  created_at:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Indexes: `(admin_id, created_at DESC)`, `(target_type, target_id)`, `(created_at DESC)`.

### 3.5 `announcements` table (new)

```ts
export const announcements = pgTable('announcements', {
  id:           uuid('id').primaryKey().defaultRandom(),
  title:        text('title').notNull(),
  body:         text('body').notNull(),
  cta_label:    text('cta_label'),
  cta_url:      text('cta_url'), // [Fix #47] validate https:// or http:// only at POST/PATCH — reject javascript: and data: URIs
  target:       text('target', { enum: ['all', 'country', 'role'] }).notNull().default('all'),
  target_value: text('target_value'),
  active:       boolean('active').notNull().default(true),
  priority:     integer('priority').notNull().default(0), // [Fix #15] higher = shown first when multiple match
  starts_at:    timestamp('starts_at', { withTimezone: true }).notNull(),
  ends_at:      timestamp('ends_at', { withTimezone: true }),
  created_by:   uuid('created_by').notNull().references(() => users.id),
  created_at:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**[Fix #15]** The `GET /v1/platform` query for the active announcement must use the full predicate:
```sql
WHERE active = true
  AND starts_at <= NOW()
  AND (ends_at IS NULL OR ends_at > NOW())
ORDER BY priority DESC, starts_at DESC
LIMIT 1
```

### 3.6 `airdrop_campaigns` table (new)

**[Fix #7]** Removed `on_chain_tx` text field (was comma-separated signatures — anti-pattern). Signatures move to `airdrop_transactions` (section 3.8).

```ts
export const airdrop_campaigns = pgTable('airdrop_campaigns', {
  id:                uuid('id').primaryKey().defaultRandom(),
  name:              text('name').notNull(),
  amount_lamports:   bigint('amount_lamports', { mode: 'number' }).notNull(), // [Fix #33] mode: 'bigint' breaks JSON.stringify; all existing bigint columns use mode: 'number'
  eligibility:       text('eligibility').notNull().default('all'),
  eligibility_value: text('eligibility_value'),
  max_recipients:    integer('max_recipients'),
  status:            text('status', {
                       enum: ['draft', 'approved', 'in_progress', 'completed', 'cancelled']
                     }).notNull().default('draft'),
  recipient_count:   integer('recipient_count'),   // total confirmed recipients after execution
  created_by:        uuid('created_by').notNull().references(() => users.id),
  approved_by:       uuid('approved_by').references(() => users.id),
  approved_at:       timestamp('approved_at', { withTimezone: true }),
  executed_at:       timestamp('executed_at', { withTimezone: true }),
  created_at:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

### 3.7 `featured_gigs` table (new)

```ts
export const featured_gigs = pgTable('featured_gigs', {
  gig_id:     uuid('gig_id').primaryKey().references(() => gigs.id, { onDelete: 'cascade' }), // [Fix #42] cascade so deleting a gig auto-removes it from the featured list
  added_by:   uuid('added_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**[Fix #11]** Enforce a maximum of 20 featured gigs at the `POST /admin/featured-gigs` endpoint — return 400 if the current count is already 20.

**[Fix #32]** `POST /admin/featured-gigs` must validate the target gig's `status`. Only gigs with `status = 'open'` (or `'accepted'` if the team decides in-progress gigs should be promotable) may be featured. Drafts, expired, cancelled, and completed gigs must return 400 — otherwise a dead link appears on the home screen.

### 3.8 `airdrop_transactions` table (new)

**[Fix #7]** Replaces the comma-separated `on_chain_tx` field. Enables per-batch status tracking and partial resumption.

```ts
export const airdrop_transactions = pgTable('airdrop_transactions', {
  id:              uuid('id').primaryKey().defaultRandom(),
  campaign_id:     uuid('campaign_id').notNull().references(() => airdrop_campaigns.id),
  batch_index:     integer('batch_index').notNull(),   // 0-based batch number
  signature:       text('signature').notNull(),
  status:          text('status', {
                     enum: ['pending', 'confirmed', 'failed']
                   }).notNull().default('pending'),
  recipient_count: integer('recipient_count').notNull(), // wallets in this batch
  created_at:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  campaign_idx:   index('airdrop_tx_campaign_idx').on(t.campaign_id),
  sig_unique:     uniqueIndex('airdrop_tx_sig_unique').on(t.signature),
}))
```

### 3.9 Deprecated fields on existing dispute tables

**[Fix #45]** Both `disputes.resolver_wallet_address` and `exchange_disputes.resolver_wallet_address` are superseded by `dispute_threads.assigned_to` (FK to users). After Phase 3:
- Stop writing to `resolver_wallet_address` on dispute resolution — use audit log instead.
- Add a comment in the schema marking both columns as deprecated: `// deprecated — use dispute_threads.assigned_to; kept for historical records`.
- Do NOT drop them yet (they may contain historical data); schedule for a future cleanup migration.

**[Fix #46]** `exchange_disputes.admin_note` (free-form text) is superseded by the structured `dispute_messages` thread. After Phase 3:
- Stop writing to `admin_note` from any new route.
- Mark the column as deprecated in the schema comment.
- Expose `admin_note` as read-only in `GET /admin/disputes/exchange/:id` for any legacy records that contain it.

### 3.10 `users` — `last_active_at` column (new)

**[Fix #44]** Required for the "active users (7d/30d)" metric in `GET /admin/metrics`.

```ts
// Add to users table:
last_active_at: timestamp('last_active_at', { withTimezone: true }),
```

Updated lazily in the `authenticate` decorator: only write if `last_active_at` is null or older than 1 hour (prevents write amplification on every request):
```ts
// In authenticate decorator, after successful auth:
if (!user.last_active_at || Date.now() - user.last_active_at.getTime() > 3_600_000) {
  void db.update(users).set({ last_active_at: new Date() }).where(eq(users.id, user.id))
}
```

### 3.11 `airdrop_eligible_wallets` table (new)

**[Fix #34]** Snapshot of eligible wallets created at approval time to prevent the recipient set changing between approval and execution.

```ts
export const airdrop_eligible_wallets = pgTable('airdrop_eligible_wallets', {
  id:          uuid('id').primaryKey().defaultRandom(),
  campaign_id: uuid('campaign_id').notNull().references(() => airdrop_campaigns.id, { onDelete: 'cascade' }),
  user_id:     uuid('user_id').notNull().references(() => users.id),
  wallet:      text('wallet').notNull(),
}, (t) => ({
  campaign_user_unique: uniqueIndex('airdrop_elig_campaign_user').on(t.campaign_id, t.user_id),
  campaign_idx:         index('airdrop_elig_campaign_idx').on(t.campaign_id),
}))
```

Populated by the `PATCH /admin/airdrops/:id/approve` handler. `POST /admin/airdrops/:id/batches` reads from this table to build transactions.

### 3.13 `gigs` and `exchange_offers` — `hidden` column (existing tables)

```ts
// Add to both tables:
hidden: boolean('hidden').notNull().default(false),
```

Add index: `index on gigs(hidden)` — used by the public feed filter.

---

## 4. Admin Backend — New Routes

All under `/v1/admin/`. All require JWT + role guard. Every mutating route writes to `admin_audit_log`.

**[Fix #6]** Register a scoped CORS plugin on the `/v1/admin` prefix that restricts `Access-Control-Allow-Origin` to the admin panel's domain (`ADMIN_ORIGIN` env var). This is separate from the mobile API's `CORS_ORIGIN`.

### 4.1 User management (extend existing)

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/admin/users` | support, moderator, dispute_resolver, super_admin | List users: filters `status`, `country`, `role`, `q` (name/wallet search), pagination. `marketing` and `finance` are excluded (see role matrix). |
| `GET` | `/admin/users/:id` | support, moderator, dispute_resolver, super_admin | Full profile: account info, stats, open disputes |
| `PATCH` | `/admin/users/:id/status` | support, moderator, super_admin | Already exists — update role guard |
| `PATCH` | `/admin/users/:id/role` | super_admin only | Already exists |

> **[Fix #26]** The `q` param searches by `wallet_address LIKE 'prefix%'`. Requires the `text_pattern_ops` index from section 3.1. Without it this is a full table scan.

### 4.2 Gig management (new)

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/admin/gigs` | support+ | All gigs: filters `status`, `category`, `country`, `poster_id`, pagination |
| `GET` | `/admin/gigs/:id` | support+ | Full detail + poster + worker + proof URLs + transaction history |
| `PATCH` | `/admin/gigs/:id/hide` | moderator, support, super_admin | Set `hidden: true`. Response must include `"escrow_note"` if gig status is `open` or `accepted` (see Fix #12). |
| `PATCH` | `/admin/gigs/:id/expire` | support, super_admin | Force-expire a stuck gig. **[Fix #37]** Guard: `status` must be `'open'` — return 409 for any other status (`completed`, `cancelled`, `disputed`, `expired`). Response must include `"escrow_note"` warning (Fix #12). |

> **[Fix #12]** Force-expiring or hiding a gig with an active on-chain escrow does NOT release SOL — the poster must still call `refund_expired` themselves. The server response for both endpoints must include:
> ```json
> { "escrow_note": "This gig has active escrow. The poster must claim their refund via the app." }
> ```
> The admin panel UI must surface this warning prominently.

> **[Fix #13]** The public user-facing endpoints `GET /v1/gigs` and `GET /v1/gigs/:id` must add `AND hidden = false` to their WHERE clauses. `GET /v1/users/:id/gigs` should still show hidden gigs to the poster who owns them (status visible, but note that the listing is hidden). This must be in the Phase 2 checklist — see section 12.

### 4.3 Exchange management (new)

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/admin/exchange` | support+ | All exchange offers with filters |
| `GET` | `/admin/exchange/:id` | support+ | Offer detail |
| `PATCH` | `/admin/exchange/:id/hide` | moderator, support, super_admin | Set `hidden: true` on exchange offer. No escrow note needed (exchange offers don't have the same persistent escrow pattern). |

### 4.4 Dispute management (extend + new)

**[Fix #8]** The existing `GET /admin/disputes` joins only the `disputes` (gig) table. Exchange disputes live in `exchange_disputes`. The endpoint must be extended to cover both using a UNION — or two separate endpoints with a unified list in the UI.

**Recommended approach**: a single `GET /admin/disputes` that performs a UNION query returning a normalised shape:
```ts
{
  id: string           // dispute ID from whichever table
  type: 'gig' | 'exchange'
  subject_id: string   // gig_id or offer_id
  subject_title: string
  party_a: { id, name }  // poster or seller
  party_b: { id, name }  // worker or buyer
  raised_by: { id, name }
  reason: string
  raised_at: string
  resolved_at: string | null
  thread_status: 'none' | 'open' | 'closed'  // [Fix #14] joined from dispute_threads
}
```

> **[Fix #31]** The UNION query must alias columns explicitly. `disputes.raised_by_id` and `exchange_disputes.opened_by_id` are different column names — the exchange branch must include `opened_by_id AS raised_by_id` so the join for `raised_by` works uniformly. Without this alias the exchange branch silently returns NULL for `raised_by`. Spell out the full SQL with aliases in the implementation rather than relying on ORM column inference.

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/admin/disputes` | support, dispute_resolver, super_admin | UNION of gig + exchange disputes. Filters: `type`, `resolved` (bool). Joined with `dispute_threads` to include thread status. Paginated: `limit` (default 25, max 100), `before_id` cursor by `raised_at DESC`. **[Fix #41]** |
| `GET` | `/admin/disputes/:type/:id` | support, dispute_resolver, super_admin | Detail for a specific dispute (`type` = `gig` or `exchange`). Includes both party profiles, subject summary, thread info. |
| `POST` | `/admin/disputes/:type/:id/thread` | dispute_resolver, super_admin | Open mediation thread. **[Fix #24]** If a thread already exists, return `200` with the existing thread (idempotent — do not 409). Sets `assigned_to` to the calling admin if not already assigned. |
| `GET` | `/admin/disputes/:type/:id/thread` | dispute_resolver, super_admin | Thread messages, paginated (`limit`, `before_id` cursor). |
| `POST` | `/admin/disputes/:type/:id/thread/messages` | dispute_resolver, super_admin | Send admin message. Body length validated ≤ 5 000 chars. Rate-limited: 60/hour per admin per thread. **[Fix #48]** Updates `party_a_last_read_at` and `party_b_last_read_at` on the thread (admin message implicitly marks both parties as needing to read). Also triggers `dispute.admin_reply_needed` push to the assigned resolver when a user posts — not on this endpoint but on user POST. **[Fix #39]** |
| `PATCH` | `/admin/disputes/:type/:id/thread/assign` | super_admin | Reassign thread to a different resolver. |
| `POST` | `/admin/disputes/:type/:id/resolve` | dispute_resolver, super_admin | Record resolution. See section 9.1 for the full flow. |

### 4.5 Reports (extend existing)

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/admin/reports` | moderator, support, super_admin | Already exists |
| `PATCH` | `/admin/reports/:id` | moderator, support, super_admin | Already exists — add `hide_content: boolean` option to trigger the `hidden` flag on the referenced gig/offer |

### 4.6 Platform & config

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/admin/platform-config` | super_admin | Already exists |
| `PATCH` | `/admin/platform-config` | super_admin | Already exists |
| `GET` | `/admin/announcements` | marketing, super_admin | List all announcements (including inactive) |
| `POST` | `/admin/announcements` | marketing, super_admin | Create announcement |
| `PATCH` | `/admin/announcements/:id` | marketing, super_admin | Update / deactivate |
| `DELETE` | `/admin/announcements/:id` | marketing, super_admin | Delete |

> **[Fix #47]** `POST /admin/announcements` and `PATCH /admin/announcements/:id` must validate `cta_url` if provided: only `https://` and `http://` schemes are accepted. Reject `javascript:`, `data:`, and any other scheme with 400 `INVALID_CTA_URL`. A `javascript:` URI stored here and rendered as a link in the mobile banner is an XSS vector.

### 4.7 Push broadcasts

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/admin/push/broadcast` | marketing, super_admin | Send push to segment. Body: `{ title, body, target?, target_value? }` |

**Note**: Blocked until issue E1 (unbounded fan-out) is resolved. Cap at 1 000 recipients per broadcast and include `"warning": "fan-out not yet queued — recipient cap applied"` in the response.

**[Fix #43]** The `broadcast_push` audit log entry records `recipient_count` as the number of tokens queried, not confirmed deliveries. Label it `attempted_count` in the metadata to avoid misleading audit reads. When E1 is resolved and async delivery is tracked, add `delivered_count` as a separate field.

**[Fix #49]** Accept an `idempotency_key` (UUID, caller-generated) in the request body. Store a short-lived deduplication record keyed by `idempotency_key` (TTL 60 seconds). If a duplicate arrives within the window, return the original response without re-sending. Prevents double-fire from network retries or double-click.

### 4.8 Airdrop campaigns

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/admin/airdrops` | airdrop, super_admin | List campaigns with batch transaction status |
| `POST` | `/admin/airdrops` | airdrop, super_admin | Create campaign (status: `draft`) |
| `GET` | `/admin/airdrops/:id` | airdrop, super_admin | **[Fix #35]** Single campaign detail including all batch transaction rows. Required by the campaign detail page. |
| `GET` | `/admin/airdrops/:id/preview` | airdrop, super_admin | Return eligible wallet list count (and first 20 wallets for preview) — does NOT execute |
| `PATCH` | `/admin/airdrops/:id/approve` | super_admin only | Approve. Guard: `approved_by !== created_by`. Snapshots eligible wallet IDs into `airdrop_eligible_wallets` staging table at approval time. **[Fix #34]** Sets `status → approved`. |
| `PATCH` | `/admin/airdrops/:id/cancel` | super_admin only | **[Fix #36]** Cancel a campaign. Guard: `status` must be `draft` or `approved` — campaigns `in_progress` cannot be cancelled mid-batch. Sets `status → cancelled`. |
| `POST` | `/admin/airdrops/:id/batches` | airdrop, super_admin | **[Fix #18]** Build the next unsigned transaction batch. Returns `{ batch_index, unsigned_tx_base64, recipient_count, remaining_batches }`. Server-side guard: campaign must have `status = 'approved'` or `'in_progress'`. Sets `status → in_progress` on first call. **[Fix #29]** Uses `SELECT FOR UPDATE` on the campaign row to prevent concurrent batch builds for the same index; uses unique constraint on `(campaign_id, batch_index)` in `airdrop_transactions` to detect duplicate confirmations. |
| `POST` | `/admin/airdrops/:id/batches/:batchIndex/confirm` | airdrop, super_admin | Record signed batch. Body: `{ signature }`. Verifies on-chain, inserts `airdrop_transactions` row. Unique constraint on `signature` returns 409 for re-submission. When all batches are confirmed, sets campaign `status → completed`. |

> **[Fix #17]** The execute endpoint (now split into `batches` + `batches/:batchIndex/confirm`) must guard server-side that `status = 'approved'` or `'in_progress'` before building any transaction. A UI-level disabled button is not sufficient.

> **[Fix #18]** Batch size: max 20 SOL transfers per Solana transaction (safe margin under the compute unit limit). The admin signs batches sequentially in the UI. See section 10 for the full flow.

### 4.9 Financial metrics (read-only)

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/admin/metrics` | finance, super_admin | Aggregates: fees collected (all-time + 30d), gig volume, exchange volume, active users (7d/30d), dispute rate, segment counts (by country, by role) |

> `marketing` uses `GET /admin/metrics` for segment sizing (country counts, role counts) — it does not need `GET /admin/users`.

> **[Fix #44]** "Active users (7d/30d)" requires `users.last_active_at`. Add `last_active_at timestamp` to the `users` table and update it in the `authenticate` decorator on each successful request (can be lazy — only write if the current value is older than 1 hour to avoid write amplification). Without this column, the metric cannot be computed. Add to Phase 1 schema changes.

> **[Fix #50]** `GET /admin/metrics` runs COUNT/SUM aggregates across multiple large tables on every call. Cache the result server-side for 5 minutes (in-process or `metrics_cache` table). Do not call this endpoint on every dashboard render without throttling — use stale-while-revalidate in React Query (`staleTime: 5 * 60 * 1000`).

### 4.10 Featured gigs

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/admin/featured-gigs` | marketing, super_admin | List (max 20) |
| `POST` | `/admin/featured-gigs` | marketing, super_admin | Add. Returns 400 if count is already 20. |
| `DELETE` | `/admin/featured-gigs/:gigId` | marketing, super_admin | Remove |

### 4.11 Audit log

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/admin/audit-log` | super_admin | Paginated: filters `admin_id`, `action`, `target_type`, `target_id`, date range |

---

## 5. Dispute Mediation — Option B

### Flow

```
1. User raises dispute on mobile (existing: POST /v1/gigs/:gigId/dispute)
2. Dispute lands in admin queue (GET /admin/disputes — now covering both gig + exchange)
3. Dispute resolver opens dispute detail in admin panel
4. Resolver clicks "Open Mediation Thread"
   → POST /admin/disputes/:type/:id/thread
   → Creates dispute_threads row (assigned_to = calling admin)
   → Push notification to BOTH parties:
     "An admin has opened a mediation thread. Open the app to respond."
   → If thread already exists: return existing thread (idempotent, 200)  [Fix #24]
5. Both parties see a "Dispute" section in the app (new screen — separate from chat)
   → POST /v1/gigs/:gigId/dispute/thread/messages  (user-facing, identified by gig)  [Fix #16]
6. Admin reads all messages, asks questions, reviews evidence
   → dispute_threads.party_a_last_read_at / party_b_last_read_at visible in admin panel  [Fix #25][Fix #30]
7. Admin clicks "Resolve"
   → POST /v1/blockchain/admin/build-resolve (server builds unsigned tx)
   → Admin signs in browser via wallet adapter
   → POST /admin/disputes/:type/:id/resolve { signature }
   → Server decodes instruction data on-chain to derive winner (does NOT trust client body)  [Fix #4]
   → Updates dispute, closes thread, notifies both parties
8. Thread closed (closed_at set), dispute marked resolved
```

### User-facing endpoints (not under /admin/)

**[Fix #16]** Users navigate by gig/offer ID, not by the internal dispute UUID. Endpoints are scoped under the parent resource:

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/gigs/:gigId/dispute/thread` | JWT — poster or worker only | Get thread messages (paginated, `before_id` cursor). **[Fix #40]** Returns 404 with `code: 'GIG_NOT_FOUND'` if gig doesn't exist; returns `200 { thread: null }` if gig exists but no thread has been opened yet. Do not use 404 for the "no thread" case — mobile can't distinguish it from a missing gig. |
| `POST` | `/v1/gigs/:gigId/dispute/thread/messages` | JWT — poster or worker only | Send message. `sender_role` derived server-side. Max 5 000 chars. Rate-limited: 20/hour per user per thread. Updates `party_a_last_read_at` (poster) or `party_b_last_read_at` (worker) on the thread. Also fires `dispute.admin_reply_needed` push to `dispute_threads.assigned_to` admin. **[Fix #39]** |
| `GET` | `/v1/exchange/:offerId/dispute/thread` | JWT — buyer or seller only | Same for exchange disputes. Same 404/200 split as above. **[Fix #40]** |
| `POST` | `/v1/exchange/:offerId/dispute/thread/messages` | JWT — buyer or seller only | Same for exchange disputes. Updates `party_a_last_read_at` (seller) or `party_b_last_read_at` (buyer). Fires admin push. **[Fix #39]** |

### Push notification events to add

Add to `plugins/notifications.ts`:
- `dispute.thread_opened` → both parties
- `dispute.message_received` → the other party only (admin messages → both parties)
- `dispute.resolved` → both parties (include outcome in payload)
- `dispute.admin_reply_needed` → the thread's `assigned_to` admin (fires when a user posts) **[Fix #39]**

> **[Fix #19]** Push events must ship in the same deployment as the mobile screen (`app/gig/[gigId]/dispute/thread.tsx`). If the notification fires before the screen exists, deep links will 404. Stage both together in Phase 3.

### Data integrity rules

- Only the poster or worker (buyer/seller for exchange) may write via user-facing endpoints — server verifies against the parent gig/offer's `poster_id` / `worker_id`
- `sender_role` is always derived server-side — never trusted from client
- Admin writes only through the admin endpoint (`dispute_resolver` or `super_admin` required)
- Messages are immutable — no edit or delete
- Exactly one thread per dispute (check constraint + unique index on each FK)
- Thread can only be closed by the resolve endpoint
- **[Fix #20]** Message `body` validated server-side: non-empty, max 5 000 characters, on both admin and user-facing endpoints

### Unread indicators

**[Fix #25][Fix #30]** `dispute_threads` carries `party_a_last_read_at` and `party_b_last_read_at`. For gig disputes: party A = poster, party B = worker. For exchange disputes: party A = seller, party B = buyer. These are updated when:
- A user POSTs a message (they've clearly read everything up to that point)
- A user GETs messages (update on read, same as current chat pattern)
- The admin panel shows "Last seen by [party A role]: 3h ago" / "Not yet seen" as a resolver aid

---

## 6. Admin Frontend — Stack & Structure

### Location in monorepo

```
apps/admin/
  app/
    (auth)/
      login/page.tsx
    (dashboard)/
      layout.tsx
      page.tsx
      users/
        page.tsx
        [id]/page.tsx
      gigs/
        page.tsx
        [id]/page.tsx
      exchange/
        page.tsx
        [id]/page.tsx
      disputes/
        page.tsx
        [type]/[id]/page.tsx      ← handles both gig and exchange disputes
      reports/page.tsx
      moderation/page.tsx
      marketing/
        page.tsx
        broadcast/page.tsx
      airdrops/
        page.tsx
        [id]/page.tsx
      config/page.tsx
      audit-log/page.tsx
  components/
    dispute-thread.tsx
    metrics-card.tsx
    user-table.tsx
    airdrop-batch-signer.tsx     ← sequential batch signing component
    ...
  lib/
    api.ts          ← typed fetch wrapper using @tenda/shared contracts
    wallet.ts       ← Solana wallet adapter setup
    auth.ts         ← JWT decode using jose (Edge-compatible)
  middleware.ts     ← redirects non-admins to /login
```

### Key dependencies

```json
{
  "next": "15.x",
  "@tanstack/react-query": "5.x",
  "shadcn/ui": "latest",
  "@solana/wallet-adapter-react": "latest",
  "@solana/wallet-adapter-wallets": "latest",
  "jose": "5.x",
  "@tenda/shared": "workspace:*"
}
```

### Auth

Admin panel uses the same JWT from `POST /v1/auth/wallet`. JWT contains `role` — middleware checks `role !== 'user'` to allow entry. Each page checks the specific role and shows a 403 view if unqualified.

**[Fix #5]** JWT stored in an `httpOnly; Secure; SameSite=Strict` cookie. `SameSite=Strict` is the CSRF mitigation — no CSRF tokens required with this setting, as cross-origin requests cannot include the cookie. Document this in the auth implementation.

**[Fix #22]** Next.js `middleware.ts` runs on the Edge Runtime, which does not support Node.js crypto APIs. `@fastify/jwt` and `jsonwebtoken` will fail at import. Use `jose` (fully Edge-compatible) for JWT verification in middleware only:
```ts
// middleware.ts
import { jwtVerify } from 'jose'
const secret = new TextEncoder().encode(process.env.JWT_SECRET)
// use jwtVerify(token, secret) — works on Edge
```
The `jose` package is already the correct choice here; do not use `jsonwebtoken` in middleware.

**[Fix #6]** The Fastify server must add a scoped CORS plugin for `/v1/admin` that restricts to `process.env.ADMIN_ORIGIN`. The admin panel's `api.ts` fetch calls include `credentials: 'include'` for the cookie. Mobile clients are never expected to call admin routes.

### API layer

`apps/admin/lib/api.ts` — typed fetch wrapper. Add `AdminContract` to `packages/shared/src/api/contracts/` (closes issue 27).

---

## 7. Admin UI — Pages & Components

### Overview / Dashboard
- Stats cards: open gigs, completed gigs (30d), fees collected (30d), active users (7d)
- Open dispute count (both gig + exchange) with link to queue
- Pending report count with link
- Recent audit log entries (last 10)

### Users page
- Accessible to: `support`, `moderator`, `dispute_resolver`, `super_admin` only
- Table: wallet (truncated + copy button), name, country, role, status, reputation, gig count, joined
- Filters: role, status, country, search by name or wallet prefix
- Row actions: View, Suspend / Reinstate
- User detail: full profile, gig history, exchange history, open disputes, recent audit events

### Gigs page
- Table: title, poster, category, status, hidden (chip), payment, country, created
- Filters: status, category, country, hidden
- Row actions: View, Hide/Unhide, Force-expire
- Gig detail: all fields + proof viewer + transaction history + escrow warning if active

### Disputes page
- Unified list (gig + exchange) from the UNION endpoint
- Table: type chip (Gig/Exchange), subject title, party A, party B, raised by, raised at, thread status chip (None/Open/Closed), assigned resolver
- Tabs: Open / Resolved
- Filter: type
- Row → Dispute detail page

### Dispute detail page
- Left panel:
  - Subject summary (gig or offer title, payment, status, type)
  - Party A profile card (poster or seller)
  - Party B profile card (worker or buyer)
  - Proof links (if submitted)
  - Escrow state note
  - Assignment: "Assigned to: [name]" + Reassign button (super_admin)
- Right panel — mediation thread:
  - If no thread: "Open Mediation Thread" button
  - If thread open: chronological messages
    - Admin messages: visually distinct
    - Per-party "last seen" indicator using `party_a_last_read_at` / `party_b_last_read_at` (Fix #25, Fix #30). Display as "[Poster/Seller] last seen: 3h ago" vs "Not yet seen".
    - Text input + Send
  - "Resolve Dispute" button → modal:
    - Winner is NOT a user-entered choice displayed after signing — it is decoded from the signed transaction by the server (Fix #4). The UI still presents the choice so the admin knows what they're signing, but the server ignores the `winner` field in the request body and derives it from the on-chain instruction data.
    - Reason field (stored in audit log)
    - "Sign & Resolve" → wallet adapter → submit signature only

### Reports page
- Table with status + content type filters
- Report detail panel with content snapshot
- Actions: Dismiss, Warn user (push notification), Hide content, Suspend user

### Moderation page
- Blocked keywords: paginated list, add form, delete per row, cache refresh

### Marketing page
- **Announcements** tab: create/edit modal (title, body, CTA, target, priority, start/end dates), active toggle
- **Featured Gigs** tab: current list (max 20 shown), search-to-add, remove. Counter shows "X / 20 used"
- **Push Broadcast** tab: disabled with warning until E1 resolved

### Airdrop page
- Campaign list: name, status, amount, recipient count, batch progress (e.g. "7 / 12 batches confirmed")
- Create campaign form
- Campaign detail:
  - Status timeline
  - "Preview eligibility" button → shows count + sample wallets
  - Approve button (different super_admin)
  - **Batch signer component** (Fix #18): shows "Batch 1 of N — 20 recipients — Sign to continue" → signs → auto-advances to next batch → repeat until done. Shows progress bar. If abandoned mid-way, state is preserved in `airdrop_transactions` — resumable

### Platform config page
- Editable form: `fee_bps`, `seeker_fee_bps`, `grace_period_seconds`
- On-chain admin pubkey displayed with issue 81 warning

### Audit log page
- Table: admin wallet (not just name — preserved on account deletion, Fix #10), role, action, target, timestamp
- Filters: admin, action, target type, date range

---

## 8. Mobile Changes

### 8.1 New dispute thread screen

**[Fix #16]** Screen navigated via gig/offer ID, not dispute ID.

Files:
- `app/gig/[gigId]/dispute/thread.tsx` — for gig disputes
- `app/exchange/[offerId]/dispute/thread.tsx` — for exchange disputes

Features:
- 3-party message timeline separate from DM chat
- Header: "Dispute Mediation" + subject title
- Messages labelled: "Admin", "You", counterparty role name
- Input: `POST /v1/gigs/:gigId/dispute/thread/messages`
- Polls at same interval as chat (WebSocket upgrade deferred to E4)
- Read-only after `closed_at` is set

### 8.2 Surface dispute CTA on gig/offer detail

On gig detail: when the gig is in `'disputed'` status and a thread exists (check `GET /v1/gigs/:gigId/dispute/thread` returns non-404), show a banner navigating to the thread screen.

On exchange offer detail: same pattern via `/v1/exchange/:offerId/dispute/thread`.

Resolution outcome banner: when thread is closed, show the outcome (poster/worker/buyer/seller won, or split).

### 8.3 Push notification handling

- `dispute.thread_opened` → navigate to gig or exchange dispute thread screen
- `dispute.message_received` → navigate to thread screen
- `dispute.resolved` → navigate to gig/offer detail with outcome chip

> **[Fix #19]** Push events and mobile screens must ship in the same deployment.

### 8.4 Announcements banner

`GET /v1/platform` extended with `active_announcement` (single object or `null`, using the priority-ordered query from Fix #15).

Mobile home screen: dismissible top banner. Dismissed state in AsyncStorage keyed by `announcement.id`.

### 8.5 What does NOT change

- `conversations` table and DM chat screens untouched
- Existing gig action sheets and CTA bar unchanged
- Dispute raising flow (`POST /v1/gigs/:id/dispute`) unchanged

---

## 9. On-chain Admin Actions

### 9.1 Resolve dispute

**[Fix #4]** The server must NOT accept a `winner` field from the client body. The winner is derived server-side by fetching the confirmed transaction and decoding the borsh-encoded instruction arguments. Flow:

1. **[Fix #28]** `POST /v1/blockchain/admin/build-resolve` lives under `/v1/blockchain/`, NOT under `/v1/admin/`, so the scoped CORS plugin and any prefix-level admin guard do NOT cover it. This endpoint must explicitly call `requireRole('dispute_resolver', 'super_admin')` — any authenticated user can reach it otherwise. Add the guard before building the transaction.

   Admin panel calls `POST /v1/blockchain/admin/build-resolve` with `{ dispute_type, dispute_id }` (no winner param — the server already knows the dispute context; the winner encoding must come from a separate admin-UI choice that gets included in the tx build)

   Actually: the winner IS encoded in the unsigned transaction the server builds. So:
   - Admin panel sends `POST /v1/blockchain/admin/build-resolve { dispute_type, dispute_id, winner: 'poster'|'worker'|'split' }` — server builds the unsigned tx encoding that winner
   - Admin signs the tx (the winner is locked in at signing)
   - Admin panel sends `POST /admin/disputes/:type/:id/resolve { signature }` — **no winner field**
   - Server fetches the confirmed on-chain transaction, decodes instruction arguments, extracts the winner value from the borsh data, stores that derived value

2. If the decoded on-chain winner disagrees with what the admin claimed to have signed (shouldn't happen in normal flow), the server uses the on-chain value and logs a warning.

**Issue 81 constraint**: only the holder of `platform_state.admin` keypair can sign. Assign `dispute_resolver` only to that person until issue 81 (multisig) is resolved.

### 9.2 Airdrop execution

See section 10. Pattern identical to dispute resolve: server builds unsigned tx per batch, admin signs, server verifies and records in `airdrop_transactions`.

---

## 10. Airdrop / Giveaway System

### Flow

1. `airdrop` admin creates campaign (status: `draft`)
2. **Different** `super_admin` approves (server-side: `approved_by !== created_by`)
3. Approver previews via `GET /admin/airdrops/:id/preview` (count + 20 sample wallets). **[Fix #34]** At the moment of approval, the server snapshots the full set of eligible wallet IDs into an `airdrop_eligible_wallets` staging table (`campaign_id`, `wallet_address`, `user_id`). All subsequent batch builds read from this snapshot, not from the live user table. Without this, the recipient set changes between approval and execution (new signups, country changes, completed gigs).
4. `airdrop` admin enters batch signing flow:
   - `POST /admin/airdrops/:id/batches` → server returns batch 0 (unsigned tx, max 20 recipients)
   - Admin signs → `POST /admin/airdrops/:id/batches/0/confirm { signature }` → server verifies, inserts `airdrop_transactions` row, status: `confirmed`
   - Repeat for batch 1, 2, … N
   - When all batches confirmed, campaign `status → completed`, `recipient_count` summed
5. If execution is abandoned mid-way, campaign stays `in_progress`. Resumable: `POST /admin/airdrops/:id/batches` returns the next unconfirmed batch index

### Eligibility rules

| Rule | `eligibility_value` | Description |
|---|---|---|
| `all` | — | Every active user with a `UserAccount` PDA |
| `country` | `'NG'` etc. | Users in a specific country |
| `seeker` | — | `is_seeker = true` |
| `no_gigs` | — | Never posted or accepted a gig |
| `completed_gigs` | `'5'` | Completed at least N gigs |

### Safety constraints

- `approved_by !== created_by` enforced server-side at the approve endpoint (not just in UI)
- **[Fix #17]** `POST /admin/airdrops/:id/batches` returns 403 if `status` is not `'approved'` or `'in_progress'`
- **[Fix #29]** `POST /admin/airdrops/:id/batches` acquires `SELECT FOR UPDATE` on the campaign row before building a transaction to prevent concurrent batch builds producing different unsigned transactions for the same batch index
- Batch size: 20 SOL transfers per transaction (within compute limits)
- Each batch signature is unique-indexed — re-submission of a confirmed signature returns 409
- **[Fix #36]** `PATCH /admin/airdrops/:id/cancel` only permitted when `status = 'draft'` or `'approved'`; campaigns `'in_progress'` cannot be cancelled mid-batch
- Maximum `amount_lamports` per campaign: define a hard cap (TBD with team); super_admin can override

---

## 11. Audit Log

**[Fix #21]** `writeAuditLog` must be fire-and-forget with structured error logging. Audit failure must not fail the primary operation:

```ts
// lib/audit.ts
export function writeAuditLog(
  db: AppDatabase,
  log: FastifyBaseLogger,
  entry: {
    admin_id: string
    admin_wallet: string   // [Fix #10] always store wallet for permanent identity
    admin_role: string
    action: string
    target_type?: string
    target_id?: string
    metadata?: Record<string, unknown>
  }
): void {  // intentionally void — not awaited by caller
  db.insert(admin_audit_log)
    .values({ ...entry, target_type: entry.target_type ?? null, target_id: entry.target_id ?? null, metadata: entry.metadata ?? null })
    .catch((err) => log.error({ err, action: entry.action }, 'audit log write failed'))
}
```

Callers: `writeAuditLog(fastify.db, fastify.log, { ... })` — no `await`.

### Actions to log

| Action | target_type | Metadata |
|---|---|---|
| `suspend_user` | `user` | `{ previous_status }` |
| `reinstate_user` | `user` | `{}` |
| `change_role` | `user` | `{ previous_role, new_role }` |
| `hide_gig` | `gig` | `{ reason? }` |
| `unhide_gig` | `gig` | `{}` |
| `force_expire_gig` | `gig` | `{}` |
| `hide_exchange` | `exchange_offer` | `{ reason? }` |
| `open_dispute_thread` | `dispute` | `{ type: 'gig'|'exchange' }` |
| `assign_dispute` | `dispute` | `{ assigned_to_id, assigned_to_wallet }` |
| `resolve_dispute` | `dispute` | `{ winner, signature, type: 'gig'|'exchange' }` |
| `update_platform_config` | `platform_config` | `{ changes: { field: [old, new] } }` |
| `add_blocked_keyword` | `keyword` | `{ keyword }` |
| `remove_blocked_keyword` | `keyword` | `{ keyword }` |
| `action_report` | `report` | `{ new_status, admin_note? }` |
| `create_announcement` | `announcement` | `{ title, priority }` |
| `update_announcement` | `announcement` | `{ changes }` |
| `delete_announcement` | `announcement` | `{ title }` |
| `broadcast_push` | `push` | `{ target, recipient_count }` |
| `approve_airdrop` | `airdrop_campaign` | `{ campaign_name }` |
| `confirm_airdrop_batch` | `airdrop_campaign` | `{ batch_index, signature, recipient_count }` |
| `feature_gig` | `gig` | `{}` |
| `unfeature_gig` | `gig` | `{}` |

---

## 12. Implementation Phases

### Phase 1 — Foundation

- [ ] Expand `users.role` enum + Drizzle migration (`'admin'` → `'super_admin'`)
- [ ] Update `UserRole` type in `@tenda/shared`
- [ ] Update `requireRole` to accept `AdminRole[]` (inclusive check, not exact match); add `'admin'` alias for `'super_admin'` during transition window
- [ ] Extend `authenticate` decorator DB cache to also store and refresh `role` (closes open_issues A2)
- [ ] Apply granular role guards to all existing admin routes
- [ ] Add `last_active_at` column to `users` table + migration; update lazily in `authenticate` decorator (Fix #44)
- [ ] Add `text_pattern_ops` index on `users.wallet_address` via raw SQL migration
- [ ] `admin_audit_log` table + migration + `writeAuditLog` helper (fire-and-forget, includes `admin_wallet`)
- [ ] Backfill `writeAuditLog` calls in existing admin routes
- [ ] Scoped CORS plugin on `/v1/admin` prefix, restricted to `ADMIN_ORIGIN` env var
- [ ] `apps/admin` scaffold: Next.js App Router, shadcn/ui, Tailwind, env config
- [ ] Admin login page (wallet connect → `/v1/auth/wallet` → JWT in `httpOnly; Secure; SameSite=Strict` cookie)
- [ ] `middleware.ts` using `jose` for Edge Runtime JWT verification
- [ ] Sidebar nav with role-based visible items
- [ ] Dashboard page (stub)
- [ ] `AdminContract` added to `@tenda/shared/src/api/contracts/` (closes issue 27)

### Phase 2 — User, Gig & Content Moderation

- [ ] `GET /admin/users` + `GET /admin/users/:id` (restricted to support+ roles, not marketing/finance)
- [ ] Users page + user detail in admin panel
- [ ] Audit log calls added to suspend/reinstate/role routes
- [ ] `hidden` boolean column on `gigs` + `exchange_offers` + migration + index
- [ ] **Update `GET /v1/gigs`, `GET /v1/gigs/:id`, `GET /v1/exchange`, `GET /v1/exchange/:id` to filter `WHERE hidden = false`**
- [ ] `GET /v1/users/:id/gigs` continues showing hidden gigs to the poster (with a `hidden: true` flag in the response)
- [ ] `PATCH /admin/gigs/:id/hide` + `PATCH /admin/gigs/:id/expire` (with escrow_note in response; expire guards `status = 'open'` Fix #37)
- [ ] `GET /admin/gigs` + `GET /admin/gigs/:id`
- [ ] `GET /admin/exchange` + `GET /admin/exchange/:id` + `PATCH /admin/exchange/:id/hide`
- [ ] Gigs page + Exchange page in admin panel (hide/expire actions with escrow warning UI)
- [ ] Reports page improvements (hide_content action)
- [ ] Moderation page (blocked keywords UI)

### Phase 3 — Dispute Mediation

- [ ] `dispute_threads` + `dispute_messages` schema + migration (two FK columns + check constraint; `party_a_last_read_at`/`party_b_last_read_at` column names)
- [ ] `POST /admin/disputes/:type/:id/thread` (idempotent — returns existing if already open)
- [ ] `GET /admin/disputes` extended to UNION gig + exchange disputes, joined with `dispute_threads`; explicit `opened_by_id AS raised_by_id` alias on exchange branch (Fix #31); pagination: `limit`/`before_id` (Fix #41)
- [ ] `GET /admin/disputes/:type/:id` detail endpoint
- [ ] `GET /admin/disputes/:type/:id/thread` + `POST .../thread/messages` (admin side, rate-limited 60/hour Fix #48)
- [ ] `PATCH /admin/disputes/:type/:id/thread/assign`
- [ ] `GET /v1/gigs/:gigId/dispute/thread` — 404 only for gig not found; 200 `{thread:null}` when no thread yet (Fix #40)
- [ ] `POST /v1/gigs/:gigId/dispute/thread/messages` (user side, gig) — fires `dispute.admin_reply_needed` push (Fix #39)
- [ ] `GET /v1/exchange/:offerId/dispute/thread` + `POST .../thread/messages` (user side, exchange) — same 404 fix + admin push (Fix #39, Fix #40)
- [ ] `party_a_last_read_at` / `party_b_last_read_at` updated on GET and POST for user-facing endpoints (Fix #30)
- [ ] Push notifications: `thread_opened`, `message_received`, `resolved`, `admin_reply_needed` — **deploy alongside mobile screens** (Fix #39)
- [ ] Admin dispute detail page with mediation thread UI (unread indicators, assignment)
- [ ] `POST /v1/blockchain/admin/build-resolve` endpoint — with `requireRole('dispute_resolver', 'super_admin')` guard (Fix #28)
- [ ] `POST /admin/disputes/:type/:id/resolve` — derives winner from on-chain instruction data
- [ ] Wallet adapter in admin panel for signing resolve tx
- [ ] Mobile: `app/gig/[gigId]/dispute/thread.tsx`
- [ ] Mobile: `app/exchange/[offerId]/dispute/thread.tsx`
- [ ] Mobile: dispute thread CTA banner on gig + offer detail screens
- [ ] Mobile: push notification handlers for dispute events

### Phase 4 — Platform & Marketing

- [ ] `announcements` table + migration + CRUD routes (with `priority` column)
- [ ] `GET /v1/platform` extended with `active_announcement` (priority-ordered, date-filtered)
- [ ] Announcements UI in admin panel
- [ ] Mobile: dismissible announcement banner on home screen
- [ ] `featured_gigs` table + routes (with 20-gig cap; `ON DELETE CASCADE` Fix #42; status guard Fix #32) + admin UI
- [ ] Mobile: `GET /v1/gigs` `featured=true` filter for home screen hero
- [ ] `POST /admin/push/broadcast` (with E1 safeguard and 1 000 recipient cap)
- [ ] Marketing page in admin panel

### Phase 5 — Airdrop & Finance

- [ ] `airdrop_campaigns` + `airdrop_transactions` + `airdrop_eligible_wallets` tables + migrations (`amount_lamports mode: 'number'` Fix #33)
- [ ] `GET /admin/airdrops`, `POST`, `GET .../preview`, `PATCH .../approve` (with wallet snapshot Fix #34), `PATCH .../cancel` (Fix #36), `POST .../batches` (with SELECT FOR UPDATE Fix #29), `POST .../batches/:index/confirm`
- [ ] `GET /admin/airdrops/:id` single campaign detail route (Fix #35)
- [ ] Airdrop page + batch signer component in admin panel
- [ ] Wallet adapter for airdrop batch signing
- [ ] `POST /admin/push/broadcast` — add `idempotency_key` deduplication (Fix #49); audit `attempted_count` not `recipient_count` (Fix #43)
- [ ] `GET /admin/metrics` with real aggregation queries (includes segment counts for marketing); add 5-minute server-side cache (Fix #50)
- [ ] Finance + metrics pages in admin panel
- [ ] Audit log page in admin panel

---

## 13. Open Questions

1. **Airdrop contract** — does `tenda-escrow` have an airdrop/distribution instruction, or will campaigns be plain SOL transfers? Determines how `POST /admin/airdrops/:id/batches` builds the unsigned transaction.

2. **Hidden gig notification to poster** — when an admin hides a gig, should the poster receive a push notification explaining why? If yes, define the notification event and add it to `plugins/notifications.ts`.

3. **Dispute raise for exchange** — confirm the exact flow: does `POST /v1/exchange/:id/dispute` exist and write to `exchange_disputes`? If the server route doesn't exist yet, it needs to be built before Phase 3 mediation makes sense.

4. **Airdrop amount cap** — what is the maximum `amount_lamports` per campaign that the `airdrop` role can create without `super_admin` override? Define the threshold before building the approve endpoint.

5. **Message rate limit (20/hour)** — confirm this is appropriate. Some disputes involve rapid clarification exchanges. Consider whether the rate limit should be per-thread (20/hour per user per thread) or global (20/hour per user across all threads).

6. **`dispute_resolver` and the admin keypair (issue 81)** — until multisig is in place, only one person can sign resolutions. Confirm who holds the `platform_state.admin` keypair and ensure they are the only one assigned `dispute_resolver`. Document in the internal ops runbook.
