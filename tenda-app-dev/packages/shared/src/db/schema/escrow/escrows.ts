/**
 * The single escrow primitive (`kind` = gig | exchange). Its satellites —
 * gig/exchange details, transactions, proofs, applications — live beside it in
 * this folder and all reference `escrows.id`.
 */

import { sql } from 'drizzle-orm'
import { DEFAULT_ACCEPT_WINDOW_SECONDS } from '../../../constants/escrow'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { assets, chains } from '../chains'
import { users } from '../identity'
import { escrowKindEnum, escrowStatusEnum } from './enums'

export const escrows = pgTable(
  'escrows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creation_operation_id: uuid('creation_operation_id'),
    kind: escrowKindEnum('kind').notNull(),
    chain_id: text('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'restrict' }),
    // FK is the composite (asset, chain_id) below — not directly on `asset`.
    // Prevents inserting an escrow with chain_id='solana:mainnet' and
    // asset='USDC_BASE'.
    asset: text('asset').notNull(),
    amount_raw: numeric('amount_raw', { precision: 78, scale: 0 }).notNull(),
    // Explicit RESTRICT so a user with any escrow history can't be hard-deleted;
    // account closure is a soft-delete via users.status='suspended' + a deletion
    // job that runs only when all escrows are in terminal state.
    creator_id: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    counterparty_id: uuid('counterparty_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    assigned_counterparty_id: uuid('assigned_counterparty_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    status: escrowStatusEnum('status').notNull(),
    // Admin takedown (CO1): hidden listings vanish from the public browse
    // surfaces (gig feed, exchange order book, public detail) but stay fully
    // operable by their parties — funds may be locked on-chain. Toggled via
    // PATCH /v1/admin/escrows/:id/hidden (escrows.takedown permission).
    hidden: boolean('hidden').notNull().default(false),
    escrow_ref: text('escrow_ref').unique('escrows_escrow_ref_uq'),
    /**
     * The escrow contract/program holding THIS escrow's funds — an address from
     * `chain_contracts`, normalised.
     *
     * Without it the contract was resolved per CHAIN, so replacing a contract
     * pointed every existing escrow's transitions at the new one while its money
     * sat in the old: `escrow_ref` on EVM is `toHex(uuidToBytes(id))` and carries
     * no contract information at all, so nothing on the row could say otherwise
     * (open_issues #89).
     *
     * Stamped with the current contract when the create tx is built, then
     * OVERWRITTEN from the event that actually created the escrow — the emitting
     * `log.address` on EVM, the owning program on Solana. Chain-attested rather
     * than intended, for the same reason `amount_raw` is.
     *
     * Nullable, and null means UNKNOWN, never "current" — a draft has no contract
     * until its create is built. `resolveEscrowContract` only falls back to the
     * chain's sole contract when that chain has had exactly one; the moment a
     * second exists the fallback stops guessing and refuses. See
     * chains/contracts/resolve.ts.
     */
    escrow_contract: text('escrow_contract'),
    /**
     * The wallet that signed the on-chain create — chain-attested from the
     * EscrowCreated event's `creator` field, write-once (the creator is
     * immutable on-chain). NULL for drafts and for escrows created before
     * this column existed. Feeds the detail wire's viewer-relative
     * `my_signer_address` (each party sees only their own bound wallet).
     */
    creator_address: text('creator_address'),
    /**
     * The wallet bound as counterparty RIGHT NOW — installed and released by
     * the exact events that manage `counterparty_id`, in the same atomic
     * patch, so the two can never disagree: EscrowAccepted /
     * CounterpartyAssigned install the event's wallet, AssignmentReleased
     * clears it, a re-assign overwrites it. NULL whenever `counterparty_id`
     * is NULL.
     */
    counterparty_address: text('counterparty_address'),
    /**
     * Direct-invite window: the assignee wallet BAKED into the create tx —
     * the only wallet that can sign their accept/decline. Stamped at build
     * time from the same primary-wallet resolution the builder uses (the EVM
     * create event carries no assignee), then chain-attested from the Solana
     * event where available; cleared by the same decline patch that clears
     * `assigned_counterparty_id`.
     */
    assigned_counterparty_address: text('assigned_counterparty_address'),
    /**
     * How long the listing stays open for a counterparty to accept, as the
     * CALLER authored it. Immutable once the draft exists.
     *
     * The duration is the durable fact; `accept_deadline` below is DERIVED from
     * it at the moment a create transaction is built (#41). A draft can sit for
     * days before it is published, so an absolute instant chosen at compose
     * time is stale by then — both programs reject a create whose accept window
     * has already closed. Recomputing from this makes that impossible rather
     * than patching it afterwards.
     *
     * NOT NULL with a default so no row can lack one: rows written before this
     * column existed are backfilled to exactly the window the old refresh path
     * would have given them, and the server-opened offers in fiat-rails get the
     * same documented default they already used.
     */
    accept_window_seconds: integer('accept_window_seconds')
      .notNull()
      .default(DEFAULT_ACCEPT_WINDOW_SECONDS),
    /**
     * DERIVED, never caller-authored: `<transaction build time> +
     * accept_window_seconds` (#41). Read by the listing surfaces and the expiry
     * job; encoded into the create tx as an absolute unix second, which is what
     * both chains take.
     *
     * Re-derived when a build needs it, NOT on every build: a stored instant
     * that still outlives a relay quote is reused as-is, because the agent's
     * EIP-3009 create nonce is a hash over the params this value sits in — two
     * builds of one task (the 402 and the payment) must agree on it. A lapsed
     * one is redrawn, since both programs reject a create whose window closed.
     */
    accept_deadline: timestamp('accept_deadline', { withTimezone: true }),
    completion_duration_seconds: integer('completion_duration_seconds'),
    completion_deadline: timestamp('completion_deadline', { withTimezone: true }),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    approval_deadline: timestamp('approval_deadline', { withTimezone: true }),
    dispute_bond_raw: numeric('dispute_bond_raw', { precision: 78, scale: 0 })
      .notNull()
      .default('0'),
    is_seeker: boolean('is_seeker').notNull().default(false),
    /**
     * Acceptance mode, mirroring the on-chain field. `true` closes
     * `acceptEscrow` and makes the creator's `assignAccept` the only path to
     * `accepted`. Rejected for `kind='exchange'` at validation — approval mode
     * is a hiring flow, and a P2P trade has no one to approve.
     */
    requires_approval: boolean('requires_approval').notNull().default(false),
    /**
     * Was the assigned worker chosen from a live application they had raised?
     *
     * Write-once, stamped by the event applier when `CounterpartyAssigned`
     * lands. This is the whole basis of D2's strike rule: a worker who put
     * their hand up and then ghosted earns an `abandoned` signal, while a
     * worker the poster placed out of the blue does not. A back-door assign
     * (raw transaction, no application) leaves it `false`, so the rule is
     * self-correcting rather than needing the route to be trusted.
     */
    assigned_from_application: boolean('assigned_from_application').notNull().default(false),
    /**
     * The assigned worker told us they are not available (off-chain — they
     * signed nothing to be assigned, so they sign nothing to step back).
     * Suppresses the abandonment strike and prompts the poster to unassign;
     * it does NOT move the escrow, which only the creator can do on-chain.
     */
    assignment_released_at: timestamp('assignment_released_at', { withTimezone: true }),
    /**
     * Mirror of the escrow's on-chain `unassign_window_seconds`, stamped at
     * create from `platform_config` and immutable thereafter — exactly like
     * `completion_duration_seconds` beside it.
     *
     * Mirrored rather than re-read from config because the on-chain value is
     * fixed per escrow: an operator retuning the default must not change how
     * long a LIVE assignment can be withdrawn for. Without this column the
     * server's guard would use today's config and could disagree with the
     * chain, either sending a doomed transaction or blocking a valid one.
     */
    unassign_window_seconds: integer('unassign_window_seconds').notNull().default(0),
    sponsored_tx_used: integer('sponsored_tx_used').notNull().default(0),
    /** Monotonic ordering for public feed events concerning this escrow. */
    public_feed_revision: numeric('public_feed_revision', { precision: 78, scale: 0 })
      .notNull()
      .default('0'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('escrows_status_idx').on(t.status),
    index('escrows_chain_idx').on(t.chain_id),
    index('escrows_creator_idx').on(t.creator_id),
    uniqueIndex('escrows_creator_creation_operation_uq')
      .on(t.creator_id, t.creation_operation_id)
      .where(sql`${t.creation_operation_id} IS NOT NULL`),
    index('escrows_counterparty_idx').on(t.counterparty_id),
    index('escrows_assigned_idx')
      .on(t.assigned_counterparty_id)
      .where(sql`${t.assigned_counterparty_id} IS NOT NULL`),
    // Serves the boot consistency probe (chains/contracts/boot-check.ts), which
    // asks whether any live escrow is stamped with a contract the registry does
    // not know. Partial because only stamped rows can ever answer it, and no
    // request path reads this — it exists so that probe is an index lookup and
    // not a scan of every escrow ever created.
    index('escrows_chain_contract_idx')
      .on(t.chain_id, t.escrow_contract)
      .where(sql`${t.escrow_contract} IS NOT NULL`),
    index('escrows_accept_deadline_idx').on(t.accept_deadline),
    index('escrows_approval_deadline_idx').on(t.approval_deadline),
    check('escrows_creator_not_counterparty_chk', sql`${t.creator_id} <> ${t.counterparty_id}`),
    check(
      'escrows_creator_not_assigned_chk',
      sql`${t.creator_id} <> ${t.assigned_counterparty_id}`,
    ),
    check('escrows_amount_positive_chk', sql`${t.amount_raw} > 0`),
    foreignKey({
      name: 'escrows_asset_chain_fk',
      columns: [t.asset, t.chain_id],
      foreignColumns: [assets.id, assets.chain_id],
    }).onUpdate('restrict').onDelete('restrict'),
  ],
)
