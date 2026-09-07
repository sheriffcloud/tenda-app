/**
 * On-chain event → DB application (the heart of the verify-tx pipeline,
 * stage-2-listeners.md § Verify job handler). Split into ./applications (the
 * declarative per-event table), ./store (seam + drizzle impl), and the apply
 * orchestrator here. Barrel keeps the `@server/lib/escrow-events` import
 * surface stable.
 */

import type { ChainNamespace } from '@tenda/shared/db/schema/chains'
import type { DecodedEvent } from '@server/chains/types'
import { normalizeContractAddress } from '@server/chains/contracts'
import {
  EVENT_APPLICATIONS,
  INTERNAL_EVENT_BY_WIRE,
  type InternalEscrowEvent,
} from './applications'
import type { EscrowEventStore } from './store'

// Named rather than `export *`: `export type` marks what is erased and
// `export` what survives to runtime, and no __exportStar loop is emitted.
export { INTERNAL_EVENT_BY_WIRE, EVENT_APPLICATIONS } from './applications'
export type { InternalEscrowEvent, EventApplication } from './applications'

export { drizzleEscrowEventStore } from './store'
export type {
  EscrowPatch,
  EscrowEventTransaction,
  ApplyEventOutcome,
  EscrowEventStore,
} from './store'

export interface ApplyEscrowEventDeps {
  store: EscrowEventStore
  chain_ns: ChainNamespace
}

export interface ApplyEscrowEventResult {
  /** False when the status guard tripped (already applied elsewhere). */
  applied: boolean
  escrow_id: string
  internal_event: InternalEscrowEvent
  /**
   * The counterparty this event installed or released, resolved to a user id
   * (null when the event touches no counterparty, or the wallet is unknown).
   *
   * Carried out because a RELEASED counterparty is gone from the escrow row
   * the moment the transition commits — anything downstream that needs to
   * address them (the push fan-out) cannot re-read it.
   */
  counterparty_id: string | null
  /**
   * Applicants this transition auto-resolved to `passed` (D4). Carried out for
   * the same reason: after the commit these rows are indistinguishable from
   * ones an earlier assign/unassign cycle settled, so re-reading would notify
   * the wrong people — or the same people twice.
   */
  passed_applicant_ids: string[]
  /** See ApplyEventOutcome.revived_applicant_ids — an unassign's counterpart. */
  revived_applicant_ids: string[]
}

/**
 * What verify-tx hands the fan-out once a transition is durable.
 *
 * Declared HERE, beside the result it is built from, and imported by both the
 * job that emits it and the worker that consumes it. It used to exist as two
 * hand-kept copies whose only link was a comment saying they mirrored each
 * other — precisely the drift a new field on one side introduces.
 */
export interface EscrowRepublishEvent {
  internal_event: InternalEscrowEvent
  escrow_id: string
  /** The on-chain event name, as decoded. */
  wire_event: DecodedEvent['name']
  /** On-chain signature/hash; clients correlate WS frames against it. */
  tx_ref: string
  /** See ApplyEscrowEventResult.counterparty_id — the released worker's only address. */
  counterparty_id: string | null
  /** See ApplyEscrowEventResult.passed_applicant_ids. */
  passed_applicant_ids: string[]
  /** See ApplyEscrowEventResult.revived_applicant_ids. */
  revived_applicant_ids: string[]
}

const WINNERS = ['creator', 'counterparty', 'split'] as const
type Winner = (typeof WINNERS)[number]

function narrowWinner(v: string | undefined): Winner | null {
  return v !== undefined && (WINNERS as readonly string[]).includes(v) ? (v as Winner) : null
}

/**
 * Apply one verified, decoded event to the DB. Idempotent two ways: the
 * status guard absorbs replays of the same logical transition, and the
 * caller's tx_ref dedup absorbs replays of the same transaction.
 */
export async function applyEscrowEvent(
  deps: ApplyEscrowEventDeps,
  event: DecodedEvent,
  tx_ref: string,
  /** Injectable so the expiry-sensitive revert is testable without waiting. */
  now: Date = new Date(),
): Promise<ApplyEscrowEventResult> {
  const app = EVENT_APPLICATIONS[event.name]
  const escrow_id = event.fields.escrow_id
  if (escrow_id === undefined) {
    throw new Error(`decoded ${event.name} event is missing escrow_id`)
  }

  const patch = app.patch(event.fields)

  // Resolve all wallet→user reads BEFORE the atomic apply so the write
  // bundle (transition + audit row + dispute stamp) happens in one shot.
  // EscrowCreated stamps the on-chain ref; the accept-family events resolve
  // the incoming counterparty wallet to a user id. Both need data beyond the
  // static table.
  if (event.name === 'EscrowCreated') {
    patch.escrow_ref = event.escrow_ref
    // Which contract actually took custody, per the chain rather than per the
    // server's intention. The create route stamps its best guess (the contract
    // current when the transaction was built); this overwrites it with the
    // emitting contract, so a create that was built just before a redeploy and
    // mined just after records where the money really went. Same principle as
    // reading settlement amounts off the event instead of projecting them.
    //
    // Normalised like every other write to this column. Both decoders already
    // emit a canonical address today, so this changes nothing now — it is here
    // because the stored form is compared in SQL (`chains/contracts/boot-check`),
    // where a checksummed value would read as an UNKNOWN contract and hold up a
    // boot for a contract the registry actually knows.
    patch.escrow_contract = normalizeContractAddress(deps.chain_ns, event.contract)
  }
  let counterparty_id: string | null = null
  if (app.counterparty !== undefined) {
    const address = event.fields[app.counterparty.field]
    counterparty_id =
      address !== undefined
        ? await deps.store.resolveUserByWallet(deps.chain_ns, address)
        : null
    // Install writes the resolved user onto the row; release clears it. Either
    // way `counterparty_id` above keeps the resolved value for the caller.
    patch.counterparty_id = app.counterparty.effect === 'install' ? counterparty_id : null
  }

  const actorAddress = app.actor_field !== undefined ? event.fields[app.actor_field] : undefined
  const actor_id =
    actorAddress !== undefined
      ? await deps.store.resolveUserByWallet(deps.chain_ns, actorAddress)
      : null

  let disputeResolution: { winner: Winner } | undefined
  if (event.name === 'DisputeResolved') {
    const winner = narrowWinner(event.fields.winner)
    if (winner !== null) disputeResolution = { winner }
  }

  // One atomic apply: the status guard + audit row + dispute stamp commit
  // together (or not at all). The store skips the audit/stamp writes when
  // the guard trips, so a replay stays an idempotent no-op.
  const outcome = await deps.store.applyEvent({
    escrow_id,
    from: app.from,
    patch,
    transaction: {
      type: app.tx_type,
      tx_ref,
      amount_raw: app.amount_field !== undefined ? (event.fields[app.amount_field] ?? null) : null,
      platform_fee_raw: app.fee_field !== undefined ? (event.fields[app.fee_field] ?? null) : null,
      creator_payout_raw:
        app.creator_amount_field !== undefined
          ? (event.fields[app.creator_amount_field] ?? null)
          : null,
      actor_id,
    },
    ...(disputeResolution !== undefined ? { disputeResolution } : {}),
    // Only when the event installs a counterparty we could actually resolve —
    // a back-door assign (raw tx, unknown wallet) settles nothing, which is
    // exactly what leaves `assigned_from_application` false and the strike off.
    ...(app.settles_application === true && counterparty_id !== null
      ? { application: { applicant_id: counterparty_id } }
      : {}),
    // Unconditional where declared, unlike the settle above: the revert must
    // not depend on resolving a wallet. A release whose counterparty wallet is
    // unknown still reopened the escrow, and leaving the applications settled
    // because of an unrelated lookup miss is how the stale state got there.
    ...(app.reverts_application_cycle === true ? { revertApplications: { now } } : {}),
  })

  return {
    applied: outcome.applied,
    escrow_id,
    internal_event: INTERNAL_EVENT_BY_WIRE[event.name],
    counterparty_id,
    passed_applicant_ids: outcome.passed_applicant_ids,
    revived_applicant_ids: outcome.revived_applicant_ids,
  }
}
