# db/schema — the authoritative Drizzle schema

The live, post-cutover schema (Stage-0 cutover #34 promoted this directory;
the legacy `schema.ts` is deleted). Migrations are generated FROM here:

```bash
pnpm --filter @tenda/shared build && pnpm --filter tenda-server db:generate
```

Never hand-write SQL migrations (project rule) — change the tables here and
generate.

## Layout

| File | Tables |
|---|---|
| `chains.ts` | `chains`, `assets` |
| `identity.ts` | `users`, `user_wallets`, `user_identities`, `auth_nonces`, `auth_otps`, `admin_users`, `email_otps`, `gas_grants` |
| `escrow.ts` | `escrows`, `gig_details`, `exchange_details`, `escrow_transactions`, `tx_attempts`, `escrow_proofs` |
| `governance.ts` | `disputes`, `dispute_messages`, `dispute_reads`, `featured_slots`, `reviews`, `platform_config` |
| `messaging.ts` | `conversations`, `messages`, `device_tokens`, `gig_subscriptions`, `announcements` |
| `moderation.ts` | `moderation_verdicts`, `category_price_stats`, `moderation_overrides` |
| `reputation.ts` | `user_standing`, `standing_events`, `standing_overrides` |
| `fiat.ts` | `fiat_providers`, `fiat_intents`, `bank_accounts` |
| `reports.ts` | `reports` |
| `ops.ts` | `chain_cursors`, `admin_audit_log` |
| `index.ts` | barrel — re-exports everything |

## Conventions

- **Amount columns**: `numeric(78, 0)` named `*_raw`. Never `bigint`.
  Drizzle returns these as `string` in JS; format at the boundary
  (`amountRawToDisplay` — display only, never for math).
- **Enums**: use `pgEnum`. Where a TS union is also needed (e.g.
  `ChainNamespace`), derive it from the pgEnum via
  `(typeof pgEnumValue.enumValues)[number]` so runtime + type stay in sync.
- **Foreign keys**: explicit `.references(() => other.id, { onDelete: ... })`.
  `'restrict'` for user-owned rows (escrow history must block hard-delete),
  `'cascade'` for owner-scoped child tables (proofs, OTPs, details).
- **Indexes**: declared in the second arg of `pgTable`; no extras "just in case."
- **Constraints**: `CHECK` and `UNIQUE` are named so generated migrations are
  diff-able and constraints are referenceable by name in raw SQL.
- **No `any` / `unknown` casts** (project rule).

## ⚠ `$onUpdate` semantics

`users.updated_at` and `escrows.updated_at` use Drizzle's `.$onUpdate(...)` to
auto-bump the timestamp. **This only fires when the UPDATE is issued through
Drizzle's `.update().set(...)` builder** — any raw-SQL path leaves the column
stale. Convention: always go through the builder (enforced in review).
