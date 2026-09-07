/**
 * DB-backed row builders for the HTTP harness: insert the rows a route needs
 * and hand back what the test asserts against.
 *
 * The OBJECT shapes come from `../fixtures` (typed factories, no database);
 * these wrap them with the insert and with the harness's chain/asset defaults.
 * Composite states built FROM these — an escrow with both parties, an open gig
 * — live in `../escrow-states.ts`.
 */
import './env'
import type { FastifyInstance } from 'fastify'
import type { ADMIN_ROLES } from '@tenda/shared'
import {
  users,
  user_wallets,
  user_identities,
  escrows,
  gig_details,
  exchange_details,
} from '@tenda/shared/db/schema'
import { bank_accounts } from '@tenda/shared/db/schema/fiat'
import type { ProofParams, ProofType } from '@tenda/shared'
import { userFixture, escrowFixture, type UserRow, type EscrowRow } from '../fixtures'
import { TEST_ASSET, TEST_CHAIN_ID } from './fake-chain'

export interface TestUser {
  row: UserRow
  token: string
}

/**
 * A well-formed uuid that belongs to no row, for the "syntactically valid, still
 * not there" half of every 404 case.
 *
 * One export because it was declared twice under two names — `ABSENT` in
 * escrow-refusals.test.ts and `ABSENT_USER` in auth-refusals.test.ts, the same
 * 36 characters — and a third spelling was the likely next step (#108). It is
 * all zeroes on purpose: uuid v4 forbids that version nibble, so no generator
 * can ever mint it, which is what makes it safe to assert "not found" against.
 */
export const ABSENT_UUID = '00000000-0000-0000-0000-000000000000'

export async function createUser(
  app: FastifyInstance,
  overrides: Partial<UserRow> = {},
): Promise<TestUser> {
  const row = userFixture(overrides)
  await app.db.insert(users).values(row)
  return { row, token: app.jwt.sign({ id: row.id, role: row.role }) }
}

/**
 * A user holding an admin role, for the /v1/admin/* suites. Defaults to
 * `super_admin` because that is the role that reaches every admin scope; pass
 * 'dispute_admin' to test the narrower one.
 *
 * Added at #105 T5b, when the fourth copy of `createUser(app, { role:
 * 'super_admin' })` appeared across the admin refusal suites. It is a thin
 * wrapper on purpose — it exists to name the intent and to keep the role
 * spelling in one place, not to hide anything.
 */
export function createAdmin(
  app: FastifyInstance,
  role: (typeof ADMIN_ROLES)[number] = 'super_admin',
): Promise<TestUser> {
  return createUser(app, { role })
}

/**
 * The Solana address `makeTransactable` links for a user. Exported so tests
 * that need to speak as that wallet (decoded on-chain events name wallets, not
 * user ids) derive it from ONE place rather than re-deriving the format.
 */
export function testWalletAddress(userId: string): string {
  return `SoTx${userId.replace(/-/g, '')}`
}

/**
 * Link a Solana wallet (matches TEST_CHAIN_ID's namespace) + a verified email
 * to a user so they clear the Stage-9D first-transaction gate
 * (`assertCanTransact`). The wallet address is derived from the user id so it
 * stays unique under the (chain_ns, address) constraint across many users.
 */
export async function makeTransactable(app: FastifyInstance, userId: string): Promise<void> {
  await app.db.insert(user_wallets).values({
    chain_ns: 'solana',
    address: testWalletAddress(userId),
    user_id: userId,
    is_primary: true,
    verified_at: new Date(),
  })
  await app.db.insert(user_identities).values({
    user_id: userId,
    kind: 'email',
    identifier: `tx-${userId}@example.com`,
    email: `tx-${userId}@example.com`,
    verified_at: new Date(),
  })
}

/**
 * A user who can transact: `createUser` + `makeTransactable`, the two-line
 * preamble every suite that drives POST /v1/escrows or a transition opens with.
 *
 * Extracted at #113, when the pair was counted at 58 call sites across 13
 * files — the same reason `createAdmin` exists. It is a thin wrapper on
 * purpose: it names the precondition (the Stage-9D first-transaction gate) so a
 * reader does not have to recognise the pair, and gives the suites one spelling
 * to change if that gate ever grows a third requirement.
 *
 * `makeTransactable` stays exported beside it, because plenty of call sites
 * clear the gate for a user they did NOT just create (a counterparty from
 * `partiedEscrow`, an assignee, a rival applicant).
 */
export async function createTransactableUser(
  app: FastifyInstance,
  overrides: Partial<UserRow> = {},
): Promise<TestUser> {
  const user = await createUser(app, overrides)
  await makeTransactable(app, user.row.id)
  return user
}

/**
 * Insert an escrow on the harness chain/asset. accept_deadline defaults to
 * now+24h (the fixture's fixed date is fine for pure object tests but HTTP
 * listing filters compare against the real clock).
 */
export async function createEscrow(
  app: FastifyInstance,
  overrides: Partial<EscrowRow> & { creator_id: string },
): Promise<EscrowRow> {
  const row = escrowFixture({
    chain_id: TEST_CHAIN_ID,
    asset: TEST_ASSET,
    accept_deadline: new Date(Date.now() + 86_400_000),
    ...overrides,
  })
  await app.db.insert(escrows).values(row)
  return row
}

export interface GigDetailsOverrides {
  title?: string
  description?: string
  category?: string
  /** Nullable like the column: a REMOTE gig persists no country. */
  country?: string | null
  city?: string | null
  remote?: boolean
  cross_border?: boolean
  /** Poster-declared evidence gate; empty (the default) accepts anything. */
  proof_requirements?: ProofType[]
  /** Per-type params (geotag radius, structured fields). */
  proof_params?: ProofParams | null
  latitude?: number | null
  longitude?: number | null
}

export async function attachGigDetails(
  app: FastifyInstance,
  escrow_id: string,
  overrides: GigDetailsOverrides = {},
): Promise<void> {
  await app.db.insert(gig_details).values({
    escrow_id,
    title: 'Test gig',
    description: 'Test description',
    category: 'service',
    country: 'NG',
    city: 'Lagos',
    remote: false,
    cross_border: false,
    ...overrides,
  })
}

export async function attachExchangeDetails(
  app: FastifyInstance,
  escrow_id: string,
  overrides: {
    fiat_amount?: string
    fiat_currency?: string
    rate?: string
    payout_account_id?: string
    /** The buyer's fiat receipt — party-scoped evidence, like escrow_proofs. */
    payment_proof_url?: string
  } = {},
): Promise<void> {
  await app.db.insert(exchange_details).values({
    escrow_id,
    fiat_amount: '15000.0000',
    fiat_currency: 'NGN',
    rate: '1500.0000000000',
    payment_window_seconds: 86_400,
    ...overrides,
  })
}

/** A saved payout account for a user. Country drives the payout currency (NG → NGN). */
export async function createBankAccount(
  app: FastifyInstance,
  user_id: string,
  overrides: Partial<{
    country: string
    kind: 'bank' | 'mobile_money'
    bank_code: string
    account_number: string
    account_name: string
    is_default: boolean
  }> = {},
): Promise<{ id: string }> {
  const [row] = await app.db
    .insert(bank_accounts)
    .values({
      user_id,
      country: 'NG',
      kind: 'bank',
      bank_code: '058',
      account_number: '0123456789',
      account_name: 'Test Seller',
      is_default: true,
      ...overrides,
    })
    .returning({ id: bank_accounts.id })
  return row
}

/**
 * Bearer header for a token. Lives beside `createUser` rather than in its own
 * module because the token it wraps comes from `TestUser` — the two are always
 * used in the same breath.
 */
export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` }
}
