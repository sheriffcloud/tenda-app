/**
 * Stage-8 fiat-rails tables (stage-8-fiat-rails.md § Database).
 *
 * Onramp/offramp are escrow-INDEPENDENT (locked decision #15): no
 * escrow_id column anywhere — USDC lands in / leaves the USER's wallet
 * and the escrow code path stays identical for fiat-funded users.
 * Tenda never holds fiat; intents only track provider-side operations.
 *
 * NOTE: after editing run `pnpm --filter @tenda/shared build` and
 * `pnpm db:generate` (migrations are generated, never hand-written).
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './identity'
import { chains, assets } from './chains'

export const fiatDirectionEnum = pgEnum('fiat_direction', ['onramp', 'offramp'])
export type FiatDirection = (typeof fiatDirectionEnum.enumValues)[number]

/** Payout rail: a bank transfer or a mobile-money wallet (e.g. GH MoMo). */
export const payoutRailKindEnum = pgEnum('payout_rail_kind', ['bank', 'mobile_money'])
export type PayoutRailKindDb = (typeof payoutRailKindEnum.enumValues)[number]

export const fiatIntentStatusEnum = pgEnum('fiat_intent_status', [
  // 'quoted' is VESTIGIAL: pre-commit quotes now live in the Redis quote cache
  // (native TTL), never as a row. The first persisted status is awaiting_*.
  // Kept in the enum on purpose — dropping a Postgres enum value is a painful
  // migration for zero benefit; no code writes it.
  'quoted',
  'awaiting_user',
  'awaiting_provider',
  'settling',
  'settled',
  'failed',
  'cancelled',
])
export type FiatIntentStatus = (typeof fiatIntentStatusEnum.enumValues)[number]

export const fiat_providers = pgTable('fiat_providers', {
  /** 'yellowcard' | 'onrampmoney' | 'p2p_internal' */
  id: text('id').primaryKey(),
  display_name: text('display_name').notNull(),
  /** { onramp: bool, offramp: bool, currencies: ['NGN'], assets: ['USDC_SOL'] } */
  capabilities: jsonb('capabilities').notNull(),
  /** Lower = preferred by routing. */
  priority: integer('priority').notNull().default(100),
  is_enabled: boolean('is_enabled').notNull().default(true),
  /** Endpoints, rate spreads — NEVER raw secrets (those stay in env). */
  config: jsonb('config'),
})

export const fiat_intents = pgTable(
  'fiat_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    direction: fiatDirectionEnum('direction').notNull(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** Destination (onramp) or source (offramp) wallet. */
    wallet_address: text('wallet_address').notNull(),
    chain_id: text('chain_id')
      .notNull()
      .references(() => chains.id),
    provider: text('provider')
      .notNull()
      .references(() => fiat_providers.id),
    fiat_currency: varchar('fiat_currency', { length: 3 }).notNull(),
    fiat_amount: numeric('fiat_amount', { precision: 20, scale: 4 }).notNull(),
    asset: text('asset')
      .notNull()
      .references(() => assets.id),
    asset_amount_raw: numeric('asset_amount_raw', { precision: 78, scale: 0 }).notNull(),
    /** Fiat per display unit of asset. */
    rate: numeric('rate', { precision: 30, scale: 10 }).notNull(),
    /** Provider fee in fiat. */
    fee_amount: numeric('fee_amount', { precision: 20, scale: 4 }).notNull(),
    status: fiatIntentStatusEnum('status').notNull(),
    /** Provider's transaction id — webhook correlation key. */
    provider_ref: text('provider_ref'),
    kyc_required: boolean('kyc_required').notNull().default(false),
    kyc_url: text('kyc_url'),
    /** Quote validity window (typ. 10min). */
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Bank details for offramp, provider callbacks, gig_id attribution… */
    metadata: jsonb('metadata'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('fiat_intents_user_idx').on(t.user_id),
    // Partial index on open statuses — reconcile/expiry jobs scan these.
    index('fiat_intents_status_idx').on(t.status),
    index('fiat_intents_provider_ref_idx').on(t.provider, t.provider_ref),
  ],
)

export const bank_accounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** ISO 3166-1 alpha-2, e.g. 'NG'. */
    country: text('country').notNull(),
    /** Payout rail; defaults to bank so existing rows stay valid. */
    kind: payoutRailKindEnum('kind').notNull().default('bank'),
    /** Bank/NIP code, or the mobile-money network id (e.g. 'MTN'). */
    bank_code: text('bank_code').notNull(),
    /** Account number (NUBAN, local no.) or the mobile-money MSISDN. */
    account_number: text('account_number').notNull(),
    /** From name-enquiry when configured; user-supplied otherwise. */
    account_name: text('account_name').notNull(),
    is_default: boolean('is_default').notNull().default(false),
    /** Set when name-enquiry confirmed the account. */
    verified_at: timestamp('verified_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Uniqueness spans the rail too, so a bank and a MoMo account can share a
  // number space without a false collision.
  (t) => [unique('bank_accounts_user_acct_uq').on(t.user_id, t.kind, t.bank_code, t.account_number)],
)
