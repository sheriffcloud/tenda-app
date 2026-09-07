/**
 * Shared helpers for the `/v1/escrows/:id/*` state-transition routes.
 *
 * The 9 transition routes (accept, decline, submit, approve, claim, cancel,
 * refund, dispute, resolve) follow an identical orchestration:
 *
 *   1. Load the escrow row by URL :id.
 *   2. Derive the caller's role (creator | counterparty | assigned | admin).
 *   3. Build a `TransitionContext` from the row + platform_config.
 *   4. Run `assertCanTransition(ctx, transition)`, LIVE state-machine check.
 *   5. Resolve `chains.get(escrow.chain_id)` and call `adapter.buildTx(...)`.
 *   6. Insert a `tx_attempts` audit row keyed by the unsigned-tx output.
 *   7. Return the unsigned tx for the client to sign + submit.
 *
 * `assertCanTransition` is live (Stage 0). `adapter.buildTx` is stubbed until
 * #29 (Anchor program rewrite). `tx_attempts` runs against v2 schema, which
 * applies at #34 cutover. So today: routes type-check end-to-end; pre-#29
 * requests get a 501 at step 5; post-#29 / pre-#34 fail at step 6.
 */

import { eq } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import { AppError } from '@server/lib/errors'
import { isUuidLike } from '@server/lib/uuid'
import { ErrorCode } from '@tenda/shared'
import {
  type Caller,
  type EscrowStatus,
  type EscrowTransition,
  type TransitionContext,
  assertCanTransition,
  assertNotTakenDown,
  takedownActionFor,
} from '@server/lib/escrow'
import type { AppDatabase } from '@server/plugins/db'

// ---------- loaders ------------------------------------------------------

export type EscrowRow = typeof escrows.$inferSelect

export async function loadEscrowOr404(db: AppDatabase, id: string): Promise<EscrowRow> {
  // Short-circuit before the query: postgres's `uuid` column rejects non-UUID
  // input with an error that would surface as a 500 instead of a clean 404.
  if (!isUuidLike(id)) {
    throw new AppError(404, ErrorCode.NOT_FOUND, `escrow ${id} not found`)
  }
  const [row] = await db.select().from(escrows).where(eq(escrows.id, id)).limit(1)
  if (row === undefined) {
    throw new AppError(404, ErrorCode.NOT_FOUND, `escrow ${id} not found`)
  }
  return row
}

// ---------- caller derivation -------------------------------------------

export interface CallerArgs {
  user_id: string
  /** From the JWT, already widened to `string` per the v1↔v2 transition. */
  role: string
  escrow: EscrowRow
}

/**
 * Map (user, escrow) → `Caller` for the state-machine guard. The same user
 * can be different `Caller` types on different escrows; this function is
 * the only place that mapping happens.
 *
 * Precedence (top wins):
 *   - creator_id match → 'creator'
 *   - counterparty_id match → 'counterparty' (canonical post-accept role)
 *   - assigned_counterparty_id match → 'assigned_counterparty' (pre-accept only;
 *     `counterparty_id` is NULL during the assignment window, see state-machine
 *     diagram in stage-0-foundation.md)
 *   - role === 'dispute_admin' AND no party match → 'dispute_admin'
 *
 * Why counterparty before assigned_counterparty: post-accept rows may keep
 * `assigned_counterparty_id` populated (the on-chain contract doesn't
 * mandate clearing it). Checking assigned first would lock the user out of
 * `submit`, `approve`, `claim_stalled`, `dispute`, and `reclaim_abandoned`,
 * since the state machine only accepts `'counterparty'` for those.
 *
 * Returns `null` when the user has no relationship to the escrow, callers
 * should map that to `FORBIDDEN`.
 */
export function deriveCaller(args: CallerArgs): Caller | null {
  const { user_id, role, escrow } = args
  if (escrow.creator_id === user_id) return 'creator'
  if (escrow.counterparty_id === user_id) return 'counterparty'
  if (escrow.assigned_counterparty_id === user_id) return 'assigned_counterparty'
  if (role === 'dispute_admin') return 'dispute_admin'
  return null
}

// The READ gate that used to live here (`canViewHidden`) moved to
// `escrow-detail-scope.ts` as `canViewHiddenEscrow`, beside the two party
// predicates the detail routes scope their private fields with. This module
// keeps the TRANSITION-caller mapping (`deriveCaller`); read gates and
// transition roles are different questions and now live apart.

export function requireCaller(args: CallerArgs): Caller {
  const c = deriveCaller(args)
  if (c === null) {
    throw new AppError(
      403,
      ErrorCode.ESCROW_WRONG_CALLER,
      `user has no role on escrow ${args.escrow.id}`,
    )
  }
  return c
}

// ---------- transition context -----------------------------------------

export interface ContextArgs {
  escrow: EscrowRow
  caller: Caller
  now: Date
  grace_period_seconds: number
}

export function buildContext(args: ContextArgs): TransitionContext {
  return {
    status: assertEscrowStatus(args.escrow.status),
    caller: args.caller,
    now: args.now,
    accept_deadline: args.escrow.accept_deadline,
    completion_deadline: args.escrow.completion_deadline,
    approval_deadline: args.escrow.approval_deadline,
    grace_period_seconds: args.grace_period_seconds,
    is_assigned: args.escrow.assigned_counterparty_id !== null,
    requires_approval: args.escrow.requires_approval,
    completion_duration_seconds: args.escrow.completion_duration_seconds,
    unassign_window_seconds: args.escrow.unassign_window_seconds,
  }
}

/**
 * The DB enum and `EscrowStatus` union are 1:1 by design, but the DB column
 * is typed as the pg-enum string. This narrowing function asserts the value
 * is one of the known statuses and throws INTERNAL_ERROR otherwise, a
 * mismatch indicates schema drift, not a user error.
 */
function assertEscrowStatus(s: string): EscrowStatus {
  // Switch-based narrowing instead of `as` cast, TS narrows the literal
  // type in each case arm. Adding a new EscrowStatus variant requires
  // adding a case here; falling through hits the default and throws.
  switch (s) {
    case 'draft':
    case 'open':
    case 'accepted':
    case 'submitted':
    case 'completed':
    case 'cancelled':
    case 'refunded':
    case 'disputed':
    case 'resolved':
      return s
    default:
      throw new AppError(
        500,
        ErrorCode.INTERNAL_ERROR,
        `escrow.status='${s}' not in EscrowStatus union, schema drift`,
      )
  }
}

// ---------- orchestrator -----------------------------------------------

/**
 * `accept` is the one transition where `requireCaller` doesn't apply as-is:
 * for a public gig (no `assigned_counterparty_id`), `counterparty_id` is
 * still NULL going into the call, it's only set as a side effect of a
 * successful accept (see `EscrowAccepted` in escrow-events/applications.ts).
 * So the first person to accept a public escrow has no prior relationship
 * for `deriveCaller` to find, and would otherwise always get rejected as
 * `ESCROW_WRONG_CALLER` before the state machine's own accept logic runs.
 *
 * Per the on-chain spec (stage-0-foundation.md `acceptEscrow`): when
 * `assigned_counterparty` is null, any non-creator caller may accept, that
 * act is what makes them the counterparty. This is scoped to `accept` only;
 * every other transition still goes through the normal `requireCaller`
 * relationship check.
 */
function resolveTransitionCaller(
  args: { user_id: string; role: string; transition: EscrowTransition },
  escrow: EscrowRow,
): Caller {
  const isPublicAccept =
    args.transition === 'accept' &&
    escrow.assigned_counterparty_id === null &&
    escrow.counterparty_id === null &&
    escrow.creator_id !== args.user_id
  if (isPublicAccept) return 'counterparty'
  return requireCaller({ user_id: args.user_id, role: args.role, escrow })
}

/**
 * One-call wrapper that loads, derives caller, builds context, and runs the
 * state-machine guard. Returns `{ escrow, ctx }` for the route to pass into
 * `adapter.buildTx`. Throws the standard escrow errors on illegal moves.
 *
 * Routes that need to special-case the transition (e.g. /refund picks
 * between `refund_expired` and `reclaim_abandoned` based on status) call
 * `loadEscrowOr404` + `requireCaller` + `buildContext` + `assertCanTransition`
 * directly instead. Both of those are EXIT transitions, which a takedown never
 * blocks, so the gate below is not something they are missing — the one entry
 * route outside this function is `build-create`, which calls it itself.
 */
export async function guardTransition(args: {
  db: AppDatabase
  escrow_id: string
  user_id: string
  role: string
  now: Date
  grace_period_seconds: number
  transition: EscrowTransition
}): Promise<{ escrow: EscrowRow; ctx: TransitionContext }> {
  const escrow = await loadEscrowOr404(args.db, args.escrow_id)
  // Before the caller derivation, not after: on a taken-down listing the
  // honest answer is "this is closed", not "you are the wrong person" — and a
  // public accept resolves to `counterparty` for ANY stranger, so the caller
  // check would never have refused them anyway.
  assertNotTakenDown(escrow, takedownActionFor(args.transition))
  const caller = resolveTransitionCaller(args, escrow)
  const ctx = buildContext({
    escrow,
    caller,
    now: args.now,
    grace_period_seconds: args.grace_period_seconds,
  })
  assertCanTransition(ctx, args.transition)
  return { escrow, ctx }
}
