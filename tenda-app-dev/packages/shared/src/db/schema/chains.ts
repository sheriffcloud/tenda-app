import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// Single source of truth for the namespace value-set. The pgEnum drives both
// the DB constraint AND the TS union — adding a value here flows everywhere.
export const chainNamespacePgEnum = pgEnum('chain_namespace', ['solana', 'eip155'])

export type ChainNamespace = (typeof chainNamespacePgEnum.enumValues)[number]

/** Runtime array for iteration / Set construction. Mirrors `ChainNamespace`. */
export const chainNamespaceEnum: ReadonlyArray<ChainNamespace> = chainNamespacePgEnum.enumValues

export const chains = pgTable(
  'chains',
  {
    id: text('id').primaryKey(), // 'solana:mainnet', 'eip155:8453'
    namespace: chainNamespacePgEnum('namespace').notNull(),
    display_name: text('display_name').notNull(),
    min_confirmations: integer('min_confirmations').notNull().default(1),
    treasury_address: text('treasury_address').notNull(),
    escrow_program: text('escrow_program').notNull(),
    // Null = no native-gas seed needed (e.g. BASE uses paymaster, CELO uses feeCurrency).
    // Non-null = one-time grant in native unit on first wallet link (phone-gated, decision #16).
    gas_seed_amount_raw: numeric('gas_seed_amount_raw', { precision: 78, scale: 0 }),
    gas_seed_wallet_address: text('gas_seed_wallet_address'),
    is_enabled: boolean('is_enabled').notNull().default(true),
  },
  (t) => [
    check(
      'chains_gas_seed_paired_chk',
      sql`(${t.gas_seed_amount_raw} IS NULL) = (${t.gas_seed_wallet_address} IS NULL)`,
    ),
  ],
)

/**
 * Every escrow contract/program a chain has ever run, append-only.
 *
 * `chains.escrow_program` says which one is CURRENT; this says which ones are
 * LEGITIMATE. The distinction is the whole point: an escrow funded before a
 * redeploy still holds its money in the old contract, so the server has to keep
 * transacting with an address that is no longer current — but only with
 * addresses an operator actually deployed, never with whatever a row happens to
 * carry.
 *
 * Written solely by `db:seed` from the SAME `escrowAddressOf(secret)` the
 * adapters and the boot check use, inserted ON CONFLICT DO NOTHING. So a
 * redeploy records itself on the next boot: the new address appends and the old
 * row stays. Nothing here is hand-maintained, which is why it cannot be
 * forgotten the way an env list would be.
 *
 * `address` is stored NORMALISED (see chains/contracts/normalize.ts) — EVM hex
 * lower-cased because checksum casing is cosmetic, Solana base58 left alone
 * because there casing is identity. Without that, `UNIQUE` would admit one
 * contract twice and set membership would silently miss.
 */
export const chain_contracts = pgTable(
  'chain_contracts',
  {
    // CASCADE, unlike the RESTRICT that guards `escrows.chain_id`. That one
    // protects rows whose loss would strand real funds; this table is a pure
    // child of the chain — meaningless without it, holding no money, and
    // rebuilt from config on the next seed. Blocking a chain's removal on its
    // own history would make the registry harder to unwind for no safety gain.
    chain_id: text('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    address: text('address').notNull(),
    /**
     * Block/slot the contract was deployed at, when the chain's secret carried
     * one at the time this row was recorded. Informational: the listener cursor
     * is chain-level and forward-only, so a contract added to the watch set is
     * never retro-scanned from here.
     *
     * `bigint`, matching `chain_cursors.last_block` — the same kind of value, and
     * the two would otherwise disagree on range for no reason. It also has to be:
     * the `uint` secret validator accepts up to 15 digits, which an `integer`
     * column cannot hold, so a fat-fingered ESCROW_DEPLOY_BLOCK would pass
     * validation and then fail deep inside the seed with a driver error.
     */
    deploy_block: bigint('deploy_block', { mode: 'number' }),
    recorded_at: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.chain_id, t.address] })],
)

export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(), // 'SOL', 'USDC_SOL', 'USDC_BASE', etc.
    chain_id: text('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'restrict' }),
    symbol: text('symbol').notNull(),
    decimals: integer('decimals').notNull(),
    // null = native; SPL mint or ERC-20 address otherwise.
    token_address: text('token_address'),
    is_stable: boolean('is_stable').notNull().default(false),
    is_enabled: boolean('is_enabled').notNull().default(true),
  },
  (t) => [
    // ERC-20 / SPL: one row per (chain, token-address). Partial because
    // Postgres treats NULL as distinct in unique constraints; without the
    // WHERE clause we couldn't enforce "one native per chain" below.
    uniqueIndex('assets_chain_token_uq')
      .on(t.chain_id, t.token_address)
      .where(sql`${t.token_address} IS NOT NULL`),
    // Native asset (no token contract): exactly one per chain.
    uniqueIndex('assets_one_native_per_chain_uq')
      .on(t.chain_id)
      .where(sql`${t.token_address} IS NULL`),
    // Composite uniqueness so escrows can FK-reference (chain_id, id) and
    // prevent mismatched chain/asset combinations on insert.
    unique('assets_id_chain_uq').on(t.id, t.chain_id),
  ],
)

