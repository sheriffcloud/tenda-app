/**
 * The DRAFT half of escrow creation, shared by POST /v1/escrows and the
 * agent one-shot (POST /v1/agent/tasks): find the draft a
 * `creation_operation_id` already minted — refusing changed terms and any
 * row that is no longer a replayable draft — or insert a new one, settling
 * the concurrent-identical-request race on the unique operation key.
 *
 * Two entry points rather than one on purpose. POST /v1/escrows builds the
 * unsigned transaction BEFORE it inserts, so a builder failure never strands
 * an orphan draft; the agent route has nothing to build first. Each caller
 * therefore sequences `findReplayedDraft` → (its own work) → `insertDraft`,
 * and the replay rules live here exactly once.
 */
import { and, eq, sql } from 'drizzle-orm'
import { ErrorCode } from '@tenda/shared'
import { escrows } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import { assertNotTakenDown } from '@server/lib/escrow'
import type { EscrowRow } from '@server/lib/escrow-routes'
import type { AppDatabase } from '@server/plugins/db'
import type { ValidatedCreateEscrow } from './validateCreateEscrow'
import { hasPendingEscrowCreateTransaction } from './hasPendingEscrowCreateTransaction'

/**
 * Every term a draft is CREATED from — the validator's output, minus the
 * permit (a signature, never persisted).
 *
 * Not all of them are replay-compared: `matchesTerms` owns that list, and the
 * line it draws is ownership — a term the CALLER authored is compared, a column
 * the SERVER derives is not. Adding a field here therefore does NOT enrol it in
 * the replay check; decide there, deliberately, which side it belongs on.
 */
export type DraftTerms = Omit<ValidatedCreateEscrow, 'permit'>

export interface DraftIdentity {
  user_id: string
  terms: DraftTerms
  /** The assignee's CURRENT wallet, re-resolved by the caller (null when unassigned). */
  assigned_counterparty_address: string | null
}

export interface DraftInsert extends DraftIdentity {
  /**
   * The clock the provisional `accept_deadline` is anchored to — injected
   * rather than read, so a test can place a draft at a chosen instant and the
   * derivation stays the same one the validator used for this request.
   */
  now: Date
  escrow_id: string
  is_seeker: boolean
  unassign_window_seconds: number
  /** The chain's current contract, normalised — what the create will target. */
  escrow_contract: string
}

/**
 * Does the body sent now describe the draft this operation already minted?
 *
 * Compares only the terms the CALLER authored and the server never rewrites.
 * A column the server owns cannot be evidence that the caller changed their
 * mind — it changes on its own, and the caller is then refused for a
 * difference they did not make.
 *
 * That is why `accept_deadline` is NOT compared, and now never can be: it is
 * DERIVED at every build from `accept_window_seconds` (#41), so it differs
 * between two builds of the same draft by construction.
 *
 * The WINDOW is compared, and that is the term #32 had to give up. Before
 * #41 the caller authored an absolute instant that the server then rewrote,
 * so the field could not be evidence of anything — measured on the real
 * routes, an identical body whose deadline was 30s out answered 409 on
 * resend while one 24h out replayed, stranding the one-shot's 402 →
 * X-PAYMENT round trip. A duration is caller-authored and never rewritten,
 * so comparing it says exactly what it appears to say: resending the same
 * window replays, resending a different one is a genuine change of terms.
 *
 * "Never rewritten" is the load-bearing half, so it is an invariant and not a
 * habit: `accept_window_seconds` is written ONCE, by the insert below, and no
 * other statement in the server sets it. Add one and this comparison starts
 * reading a column the server owns — which is #32, reproduced.
 *
 * Same rule, one field over: the assignee is compared by
 * `assigned_counterparty_id` and not by `assigned_counterparty_address`,
 * because `restampAssignee` below owns the address.
 *
 * TRIPWIRE. `prepareDraftCreate` re-stamps FOUR columns — accept_deadline,
 * escrow_contract, assigned_counterparty_address and
 * `completion_duration_seconds`. The first three are correctly absent here,
 * but the fourth IS compared, and the only thing making that safe is
 * reachability: it is re-stamped solely when the row's value is NULL (a
 * server-opened exchange draft backfilled from the offer's payment window),
 * and those rows carry NO `creation_operation_id`, so `findReplayedDraft`
 * can never return one. Give a server-opened offramp draft an operation id —
 * a natural way to make P2P offer creation idempotent — and this comparison
 * starts reading a column the server rewrites, reproducing #32 for exchange
 * escrows. Drop it from this list at the same time.
 */
function matchesTerms(row: EscrowRow, terms: DraftTerms): boolean {
  return (
    row.kind === terms.kind &&
    row.chain_id === terms.chain_id &&
    row.asset === terms.asset &&
    row.amount_raw === terms.amount_raw &&
    row.assigned_counterparty_id === terms.assigned_counterparty_id &&
    row.requires_approval === terms.requires_approval &&
    row.accept_window_seconds === terms.accept_window_seconds &&
    row.completion_duration_seconds === terms.completion_duration_seconds &&
    row.dispute_bond_raw === terms.dispute_bond_raw
  )
}

async function assertReplayable(db: AppDatabase, row: EscrowRow): Promise<void> {
  if (row.status !== 'draft') {
    throw new AppError(409, ErrorCode.ESCROW_WRONG_STATUS, 'This creation operation is no longer a draft')
  }
  assertNotTakenDown(row, 'create')
  if (await hasPendingEscrowCreateTransaction(db, row.id)) {
    throw new AppError(
      409,
      ErrorCode.ESCROW_WRONG_STATUS,
      'A create transaction is awaiting confirmation, wait for it to settle',
    )
  }
}

/**
 * A replayed/raced create REBUILDS the tx, and the rebuild bakes the
 * assignee's CURRENT primary — so the row must follow (the same record-=-bake
 * invariant build-create keeps). No-op for unassigned escrows and unchanged
 * wallets; draft-guarded like every draft write.
 */
async function restampAssignee(db: AppDatabase, row: EscrowRow, address: string | null): Promise<EscrowRow> {
  if (address === null || row.assigned_counterparty_address === address) return row
  await db
    .update(escrows)
    .set({ assigned_counterparty_address: address })
    .where(and(eq(escrows.id, row.id), eq(escrows.status, 'draft')))
  return { ...row, assigned_counterparty_address: address }
}

/** The one verified path a found row takes: same terms, still a draft, restamped. */
async function replay(db: AppDatabase, row: EscrowRow, args: DraftIdentity): Promise<EscrowRow> {
  if (!matchesTerms(row, args.terms)) {
    throw new AppError(
      409,
      ErrorCode.VALIDATION_ERROR,
      'creation_operation_id was already used with different escrow terms',
    )
  }
  await assertReplayable(db, row)
  return restampAssignee(db, row, args.assigned_counterparty_address)
}

/**
 * The draft this caller's `creation_operation_id` already minted, verified
 * against the terms sent now, or null when the operation is new (or the
 * caller sent no operation id, which never replays).
 */
export async function findReplayedDraft(db: AppDatabase, args: DraftIdentity): Promise<EscrowRow | null> {
  if (args.terms.creation_operation_id === null) return null
  const row = await db.query.escrows.findFirst({
    where: and(
      eq(escrows.creator_id, args.user_id),
      eq(escrows.creation_operation_id, args.terms.creation_operation_id),
    ),
  })
  return row === undefined ? null : replay(db, row, args)
}

/**
 * The columns a new draft is inserted with — exported so POST /v1/escrows
 * can build the unsigned transaction from EXACTLY these values before the
 * row exists (build-before-insert), rather than from a parallel spelling.
 */
export function draftColumns(args: DraftInsert): typeof escrows.$inferInsert & DraftWindowsPresent & { id: string } {
  const { terms } = args
  return {
    id: args.escrow_id,
    creation_operation_id: terms.creation_operation_id,
    kind: terms.kind,
    chain_id: terms.chain_id,
    asset: terms.asset,
    amount_raw: terms.amount_raw,
    creator_id: args.user_id,
    assigned_counterparty_id: terms.assigned_counterparty_id,
    assigned_counterparty_address: args.assigned_counterparty_address,
    requires_approval: terms.requires_approval,
    unassign_window_seconds: args.unassign_window_seconds,
    status: 'draft',
    // The contract this create targets. A new escrow always joins the
    // CURRENT deployment — but it must be recorded, because by the time a
    // transition is built "current" may mean a different contract and the
    // funds will not have moved with it. Re-attested from the EscrowCreated
    // log when the tx lands (lib/escrow-events).
    escrow_contract: args.escrow_contract,
    accept_window_seconds: terms.accept_window_seconds,
    // Provisional, and only that. The OWNER's own list (/v1/users/:id/escrows
    // serves drafts too) projects `accept_deadline` and the clients render it,
    // so a draft cannot carry a blank where every other escrow shows a date.
    // The expiry job does NOT read this — it filters status open/accepted
    // (jobs/expire-escrows.ts). `prepareDraftCreate` re-derives the value from
    // the window when the create is actually built, and THAT is what reaches
    // the chain (#41).
    accept_deadline: new Date(args.now.getTime() + terms.accept_window_seconds * 1000),
    completion_duration_seconds: terms.completion_duration_seconds,
    dispute_bond_raw: terms.dispute_bond_raw,
    is_seeker: args.is_seeker,
  }
}

/** The columns `draftCreatePayload` reads, typed PRESENT rather than `| null` — an inserted draft always carries them, which the raw insert type cannot say. */
interface DraftWindowsPresent {
  accept_deadline: Date
  completion_duration_seconds: number
  unassign_window_seconds: number
  is_seeker: boolean
  requires_approval: boolean
  assigned_counterparty_id: string | null
  dispute_bond_raw: string
}

/**
 * Insert the draft. A concurrent identical request may win the unique
 * operation key between the caller's `findReplayedDraft` and this insert; the
 * loser then follows the verified replay path and returns the winner's row,
 * so both callers hold ONE draft. `created` says which of the two happened.
 */
export async function insertDraft(
  db: AppDatabase,
  args: DraftInsert,
): Promise<{ row: EscrowRow; created: boolean }> {
  const { terms } = args
  const values = draftColumns(args)
  const inserted = terms.creation_operation_id === null
    ? await db.insert(escrows).values(values).returning()
    : await db.insert(escrows).values(values).onConflictDoNothing({
        target: [escrows.creator_id, escrows.creation_operation_id],
        where: sql`${escrows.creation_operation_id} IS NOT NULL`,
      }).returning()
  const row = inserted[0]
  if (row !== undefined) return { row, created: true }
  const winner = await findReplayedDraft(db, args)
  if (winner === null) {
    throw new AppError(409, ErrorCode.INTERNAL_ERROR, 'Could not reconcile escrow creation')
  }
  return { row: winner, created: false }
}
