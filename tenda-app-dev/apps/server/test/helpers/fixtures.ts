import { DEFAULT_ACCEPT_WINDOW_SECONDS } from '@tenda/shared'
/**
 * Typed object factories for tests. Real implementations — usable now without
 * a DB or any external infra.
 *
 * Each factory:
 *   - Returns a fully-populated, schema-shaped object.
 *   - Accepts a `Partial<T>` of overrides for the columns the test cares about.
 *   - Uses deterministic defaults where possible (stable UUIDs, fixed timestamps)
 *     so test failures diff cleanly.
 *
 * The intent is "what's being asserted is visible in the test body" — never
 * have a test hand-roll 15 columns of escrow fixture inline.
 */

import { randomUUID } from 'node:crypto'
import { escrows } from '@tenda/shared/db/schema/escrow'

/**
 * Stand-in escrow program for `DecodedEvent.contract` in tests whose subject is
 * NOT contract pinning (assignment cycles, application settlement, …). Those
 * events still have to name an emitter — every real one does — and one shared
 * constant keeps a dozen literals from drifting apart.
 *
 * Tests that DO exercise pinning use real, registry-known addresses instead;
 * a value that no registry knows is exactly what `resolveEscrowContract`
 * refuses, so this must never be used as an escrow's stamp.
 */
export const TEST_ESCROW_PROGRAM = 'TendaProgram1111111111111111111111111111111'

export interface UserRow {
  id: string
  first_name: string
  last_name: string
  bio: string | null
  avatar_url: string | null
  country: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  role: 'user' | 'dispute_admin' | 'super_admin'
  status: 'active' | 'suspended'
  is_seeker: boolean
  is_agent: boolean
  review_score: string | null
  sponsored_tx_remaining: number
  advanced_mode_enabled: boolean
  last_active_at: Date | null
  created_at: Date
  updated_at: Date
}

export function userFixture(overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date('2026-01-01T00:00:00Z')
  return {
    id: randomUUID(),
    first_name: 'Test',
    last_name: 'User',
    bio: null,
    avatar_url: null,
    country: 'NG',
    city: null,
    latitude: null,
    longitude: null,
    role: 'user',
    status: 'active',
    is_seeker: false,
    is_agent: false,
    review_score: null,
    sponsored_tx_remaining: 3,
    advanced_mode_enabled: false,
    last_active_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

export interface UserWalletRow {
  chain_ns: 'solana' | 'eip155'
  address: string
  user_id: string
  is_primary: boolean
  verified_at: Date
}

export function walletFixture(overrides: Partial<UserWalletRow> = {}): UserWalletRow {
  return {
    chain_ns: 'solana',
    address: 'TestSolanaAddress11111111111111111111111111',
    user_id: randomUUID(),
    is_primary: true,
    verified_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

/**
 * DERIVED from the schema, not re-declared.
 *
 * This was a hand-written interface listing every column, which meant each new
 * escrow column had to be mirrored here by hand — and a fixture that silently
 * lagged the table is a drift vector that only shows up as a confusing type
 * error in unrelated suites. Inferring it means a new column is a compile error
 * in `escrowFixture` (where a default belongs) and nowhere else.
 */
export type EscrowRow = typeof escrows.$inferSelect

/**
 * Derived alongside `EscrowRow` for the same reason: a hand-listed copy of the
 * status enum is one more thing to remember when the DB one changes.
 */
export type EscrowStatus = EscrowRow['status']



export function escrowFixture(overrides: Partial<EscrowRow> = {}): EscrowRow {
  const now = new Date('2026-01-01T00:00:00Z')
  const id = overrides.id ?? randomUUID()
  // Default to 'draft' so the fixture mirrors a row that hasn't been
  // published on-chain yet. `escrow_ref` is set on publish; defaulting to
  // `open` + null ref would produce schema-invalid rows. Callers that want
  // an `open` escrow must supply `escrow_ref`.
  const status: EscrowStatus = overrides.status ?? 'draft'
  return {
    id,
    creation_operation_id: null,
    kind: 'gig',
    chain_id: 'solana:mainnet',
    asset: 'USDC_SOL',
    amount_raw: '1000000', // 1 USDC at 6 decimals
    creator_id: randomUUID(),
    counterparty_id: null,
    assigned_counterparty_id: null,
    // Signer-address columns default null — "not recorded", the state every
    // pre-column row and unconfirmed draft is in.
    creator_address: null,
    counterparty_address: null,
    assigned_counterparty_address: null,
    status,
    hidden: false,
    escrow_ref: status === 'draft' ? null : `escrow-ref-${id}`,
    // Null = "unknown", which is what every row created before the column
    // existed carries and what `resolveEscrowContract` handles by falling back
    // to the chain's sole contract. Deliberately NOT a placeholder address: a
    // fabricated one would be a contract no registry knows, which is exactly
    // what the boot probe is built to reject. Tests that exercise pinning set
    // it explicitly.
    escrow_contract: null,
    accept_window_seconds: DEFAULT_ACCEPT_WINDOW_SECONDS,
    accept_deadline: new Date('2026-01-08T00:00:00Z'),
    completion_duration_seconds: 86_400,
    completion_deadline: null,
    submitted_at: null,
    approval_deadline: null,
    dispute_bond_raw: '0',
    is_seeker: false,
    requires_approval: false,
    assigned_from_application: false,
    assignment_released_at: null,
    unassign_window_seconds: 0,
    sponsored_tx_used: 0,
    public_feed_revision: '0',
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}
