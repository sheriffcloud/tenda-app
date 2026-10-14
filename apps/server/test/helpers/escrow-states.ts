/**
 * Composite DB states + request-body builders shared by the CO2 route-matrix
 * suites (test/integration/escrows-*.test.ts, gigs-listing.test.ts). Keeps
 * each suite reading as "what's being asserted", per the helpers convention.
 */
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { disputes, escrows } from '@tenda/shared/db/schema'
import {
  TEST_CHAIN_ID,
  TEST_ASSET,
  createUser,
  createEscrow,
  attachGigDetails,
  type GigDetailsOverrides,
  type TestUser,
} from './test-app'
import type { EscrowRow, UserRow } from './fixtures'

// ---------- request bodies --------------------------------------------------

/** Valid POST /v1/escrows body on the harness chain/asset. */
export function createEscrowBody(overrides: Record<string, unknown> = {}) {
  return {
    creation_operation_id: randomUUID(),
    kind: 'gig',
    chain_id: TEST_CHAIN_ID,
    asset: TEST_ASSET,
    amount_raw: '1000000',
    accept_window_seconds: 24 * 3600,
    completion_duration_seconds: 3_600,
    ...overrides,
  }
}

/** Valid POST /v1/gigs body (non-remote gigs require country + city). */
export function gigDetailsBody(escrow_id: string, overrides: Record<string, unknown> = {}) {
  return { escrow_id, title: 'Wash my car', category: 'service', country: 'NG', city: 'Lagos', ...overrides }
}

/** Cloudinary URL inside the uploading user's own proofs folder. */
export function proofUrl(userId: string, n: number): string {
  return `https://res.cloudinary.com/test-cloud/image/upload/tenda/proofs/${userId}/p${n}.jpg`
}

// ---------- composite DB states ----------------------------------------------

export interface PartiedEscrow {
  creator: TestUser
  worker: TestUser
  escrow: EscrowRow
}

/** Creator + counterparty on an escrow in the given status. */
export async function partiedEscrow(
  app: FastifyInstance,
  status: 'accepted' | 'submitted' | 'completed',
): Promise<PartiedEscrow> {
  const creator = await createUser(app)
  const worker = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status,
  })
  return { creator, worker, escrow }
}

export interface DisputedEscrow extends PartiedEscrow {
  dispute_id: string
}

/**
 * Roles to give the two parties. Only needed for the conflict-of-interest
 * cases (a disputant who ALSO holds an admin role); overriding `creator_id`
 * instead would desync `raised_by` and build a party list that cannot occur.
 */
export interface DisputePartyRoles {
  creatorRole?: UserRow['role']
  workerRole?: UserRow['role']
}

/** Parties + a live dispute row (escrow status 'disputed'). */
export async function disputedEscrow(
  app: FastifyInstance,
  /** Escrow columns to override — e.g. the acceptance mode a dossier reports. */
  overrides: Partial<EscrowRow> = {},
  roles: DisputePartyRoles = {},
): Promise<DisputedEscrow> {
  const creator = await createUser(app, roles.creatorRole === undefined ? {} : { role: roles.creatorRole })
  const worker = await createUser(app, roles.workerRole === undefined ? {} : { role: roles.workerRole })
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    counterparty_id: worker.row.id,
    status: 'disputed',
    ...overrides,
  })
  const [row] = await app.db
    .insert(disputes)
    .values({ escrow_id: escrow.id, raised_by: creator.row.id, reason: 'Work was never delivered as agreed' })
    .returning({ id: disputes.id })
  return { creator, worker, escrow, dispute_id: row.id }
}

/** A publicly-listed open gig (escrow + details satellite). */
export async function openGig(
  app: FastifyInstance,
  args: {
    title?: string
    category?: string
    country?: string
    amount_raw?: string
    /** Settle on a non-default chain — requires `seedAltChain` (FK). */
    chain_id?: string
    asset?: string
    details?: GigDetailsOverrides
    /**
     * Escrow COLUMNS to override — `hidden`, `requires_approval`, `status`,
     * whichever the suite is actually about. A passthrough rather than one
     * named arg per column: the alternative grew a parameter every time a
     * suite needed a different corner of the same row.
     */
    escrow?: Partial<EscrowRow>
  } = {},
): Promise<{ creator: TestUser; escrow: EscrowRow }> {
  const creator = await createUser(app)
  const escrow = await createEscrow(app, {
    creator_id: creator.row.id,
    status: 'open',
    amount_raw: args.amount_raw ?? '1000000',
    ...(args.chain_id === undefined ? {} : { chain_id: args.chain_id }),
    ...(args.asset === undefined ? {} : { asset: args.asset }),
    ...args.escrow,
  })
  await attachGigDetails(app, escrow.id, {
    title: args.title ?? 'Open gig',
    category: args.category ?? 'service',
    country: args.country ?? 'NG',
    ...args.details,
  })
  return { creator, escrow }
}

/**
 * Take an escrow down / put it back, the way an admin's PATCH leaves it.
 *
 * Writes the column directly rather than going through
 * `PATCH /v1/admin/escrows/:id/hidden`: that route's own behaviour (permission,
 * validation, audit event) is covered by admin-takedown.test.ts, and every
 * suite that just needs a hidden ROW would otherwise pay for a super_admin
 * user it never uses again.
 */
async function setEscrowHidden(
  app: FastifyInstance,
  escrow_id: string,
  hidden: boolean,
): Promise<void> {
  await app.db.update(escrows).set({ hidden }).where(eq(escrows.id, escrow_id))
}

export async function hideEscrow(app: FastifyInstance, escrow_id: string): Promise<void> {
  await setEscrowHidden(app, escrow_id, true)
}

/** Restores visibility — for asserting that the gate is what changed. */
export async function unhideEscrow(app: FastifyInstance, escrow_id: string): Promise<void> {
  await setEscrowHidden(app, escrow_id, false)
}
