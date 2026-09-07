/**
 * Transaction verification + event decoding for the Tenda Escrow program.
 *
 * Events are emitted via `emit!` (program-log encoding, Stage 0 decision in
 * the program's lib.rs) and decoded with Anchor's EventParser. Decoded
 * payloads are re-verified against the caller's expectations, the webhook /
 * client hint is never trusted as source of truth (stage-2 risk table).
 */

import { BN, EventParser, type Program } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import type { TendaEscrow } from '@tenda/shared/idl'
import { bytesToUuid } from '@server/chains/ids'
import {
  PROGRAM_ID,
  decodeEscrowAccount,
  escrowPda,
  isProgramOwned,
  type EscrowAccount,
} from '@server/chains/solana/pdas'
import type { SolanaRpc } from '@server/chains/solana/rpc'
import {
  ESCROW_EVENTS,
  type ChainId,
  type DecodedEvent,
  type EscrowEvent,
  type EscrowState,
  type VerifiedTx,
  type VerifyTxArgs,
} from '@server/chains/types'

export interface SolanaVerifierDeps {
  rpc: SolanaRpc
  chain_id: ChainId
  /** Coder source, the Program constructor camelCases the IDL (see pdas.ts). */
  program: Program<TendaEscrow>
}

/** PascalCase wire name (EscrowEvent) → camelCase IDL/coder name. */
function coderEventName(event: EscrowEvent): string {
  return event.charAt(0).toLowerCase() + event.slice(1)
}

/** camelCase coder name → PascalCase wire name, iff it is an escrow event. */
function wireEventName(coderName: string): EscrowEvent | null {
  const pascal = coderName.charAt(0).toUpperCase() + coderName.slice(1)
  return (ESCROW_EVENTS as readonly string[]).includes(pascal) ? (pascal as EscrowEvent) : null
}

/**
 * Which decoded field names the actor for each event. DisputeResolved is
 * admin-initiated, no party actor.
 */
const ACTOR_FIELD: Record<EscrowEvent, string | null> = {
  EscrowCreated: 'creator',
  EscrowAccepted: 'counterparty',
  EscrowDeclined: 'declinedBy',
  CounterpartyAssigned: 'assignedBy',
  AssignmentReleased: 'releasedBy',
  ProofSubmitted: 'counterparty',
  EscrowApproved: 'creator',
  PaymentClaimed: 'counterparty',
  EscrowCancelled: 'creator',
  EscrowExpired: 'creator',
  EscrowAbandoned: 'creator',
  DisputeRaised: 'raisedBy',
  DisputeResolved: null,
}

export function createSolanaVerifier(deps: SolanaVerifierDeps) {
  const parser = new EventParser(PROGRAM_ID, deps.program.coder)

  async function verifyTx(tx_ref: string, args: VerifyTxArgs): Promise<VerifiedTx> {
    const tx = await deps.rpc.getTransaction(tx_ref)
    if (tx === null) {
      return { confirmed: false, pending: true, reason: 'signature not found at commitment' }
    }
    if (tx.failed) {
      return { confirmed: true, failed: true, reason: tx.failure_reason ?? 'transaction failed' }
    }

    const expected = args.expected_event
    // Wide net = the polling/webhook producers, which enqueue every signature
    // touching the program and pass no `expected_event`. On that path a
    // confirmed tx that emits NO escrow event is not an escrow state-change
    // (every escrow instruction emits one), it's program-maintenance traffic
    // (upgrade / IDL write) or an unrelated tx, so it is `irrelevant`, never a
    // failed attempt. When an `expected_event` IS given (client-ping /
    // reconcile), behaviour is unchanged: a missing/mismatched event is a
    // failure.
    const wideNet = expected === undefined
    let sawEscrowEvent = false
    // EventParser throws on log shapes it can't frame (e.g. a program-upgrade
    // tx that never invoked our program).
    try {
      for (const decoded of parser.parseLogs(tx.log_messages)) {
        const wire = wireEventName(decoded.name)
        if (wire === null) continue
        sawEscrowEvent = true
        // With an expectation: exact match. Without: any escrow event qualifies.
        const name: EscrowEvent | null = wideNet
          ? wire
          : decoded.name === coderEventName(expected) ? expected : null
        if (name === null) continue
        const event = toDecodedEvent(name, decoded.data as Record<string, unknown>)
        if (args.escrow_id !== undefined && event.fields.escrow_id !== args.escrow_id) {
          return {
            confirmed: true,
            failed: true,
            reason: `event escrow_id ${event.fields.escrow_id} does not match expected ${args.escrow_id}`,
          }
        }
        return { confirmed: true, failed: false, event }
      }
    } catch (e) {
      // Unframeable logs. On the wide-net path this is a non-escrow tx →
      // inert skip; with an expectation it's a genuine verification failure.
      if (wideNet) {
        return { confirmed: true, irrelevant: true, reason: 'transaction is not an escrow instruction' }
      }
      return {
        confirmed: true,
        failed: true,
        reason: `could not parse transaction logs: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
    if (wideNet && !sawEscrowEvent) {
      return { confirmed: true, irrelevant: true, reason: 'no escrow event in transaction' }
    }
    return {
      confirmed: true,
      failed: true,
      reason: `expected event ${args.expected_event ?? '(any escrow event)'} not found in transaction logs`,
    }
  }

  function toDecodedEvent(name: EscrowEvent, data: Record<string, unknown>): DecodedEvent {
    const fields: Record<string, string> = {}
    let escrow_ref = ''
    for (const [key, value] of Object.entries(data)) {
      const rendered = renderField(key, value)
      if (rendered === null) continue
      fields[rendered.key] = rendered.value
      if (key === 'escrowId') {
        escrow_ref = escrowPda(Buffer.from(value as number[])).toBase58()
      }
    }
    const actorField = ACTOR_FIELD[name]
    const actorValue = actorField !== null ? data[actorField] : undefined
    return {
      name,
      escrow_ref,
      // Always the compiled-in program id: `EventParser` is constructed with
      // PROGRAM_ID, so only that program's logs reach here. Solana cannot have a
      // second live address the way EVM can — the id is `declare_id!`, the PDAs
      // derive from it, and `anchor upgrade` keeps it — so this is a constant
      // rather than a variable, and stamping it is what lets a future program
      // replacement be DETECTED (chains/contracts/resolve.ts refuses a stamp that
      // is not the current program) instead of silently mis-signed.
      contract: PROGRAM_ID.toBase58(),
      ...(actorValue instanceof PublicKey
        ? { actor: `${deps.chain_id}:${actorValue.toBase58()}` }
        : {}),
      fields,
    }
  }

  async function fetchEscrowState(escrow_ref: string): Promise<EscrowState | null> {
    const account = await deps.rpc.getAccount(escrow_ref)
    // Foreign-owned reads as absent: this is a probe, and "no escrow of ours
    // here" is exactly what `null` means to every caller. See isProgramOwned.
    if (account === null || !isProgramOwned(account)) return null
    return toEscrowState(escrow_ref, decodeEscrowAccount(deps.program.coder, account.data))
  }

  return { verifyTx, fetchEscrowState }
}

// ---- decoding helpers -------------------------------------------------------

/**
 * Render one decoded Borsh value into the stringly `DecodedEvent.fields`
 * shape. `escrowId` byte arrays become UUID strings under `escrow_id`;
 * unit-enum objects become their variant key; `null` Options are omitted.
 */
function renderField(key: string, value: unknown): { key: string; value: string } | null {
  if (value === null || value === undefined) return null
  if (key === 'escrowId' && Array.isArray(value)) {
    return { key: 'escrow_id', value: bytesToUuid(value as number[]) }
  }
  if (value instanceof PublicKey) return { key: snakeCase(key), value: value.toBase58() }
  if (value instanceof BN) return { key: snakeCase(key), value: value.toString() }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return { key: snakeCase(key), value: String(value) }
  }
  if (Array.isArray(value)) {
    // Fixed byte arrays (e.g. proof_hash), render as hex for log-friendliness.
    return { key: snakeCase(key), value: Buffer.from(value as number[]).toString('hex') }
  }
  if (typeof value === 'object') {
    // Unit enum, e.g. { accepted: {} } → 'accepted'.
    const variants = Object.keys(value)
    if (variants.length === 1) return { key: snakeCase(key), value: variants[0] }
  }
  if (typeof value === 'string') return { key: snakeCase(key), value }
  return null
}

function snakeCase(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

const STATUS_BY_VARIANT: Record<string, EscrowState['status']> = {
  open: 'open',
  accepted: 'accepted',
  submitted: 'submitted',
  completed: 'completed',
  cancelled: 'cancelled',
  refunded: 'refunded',
  disputed: 'disputed',
  resolved: 'resolved',
}

function enumVariant(value: object): string {
  const keys = Object.keys(value)
  if (keys.length !== 1) throw new Error(`not a unit enum: ${JSON.stringify(value)}`)
  return keys[0]
}

function toEscrowState(escrow_ref: string, e: EscrowAccount): EscrowState {
  const statusVariant = enumVariant(e.status)
  const status = STATUS_BY_VARIANT[statusVariant]
  if (status === undefined) {
    throw new Error(`unknown on-chain escrow status variant: ${statusVariant}`)
  }
  return {
    escrow_ref,
    escrow_id: bytesToUuid(e.escrowId),
    kind: enumVariant(e.kind) === 'gig' ? 'gig' : 'exchange',
    asset_address: e.asset.equals(SystemProgram.programId) ? null : e.asset.toBase58(),
    amount_raw: e.amount.toString(10),
    creator_address: e.creator.toBase58(),
    counterparty_address: e.counterparty === null ? null : e.counterparty.toBase58(),
    assigned_counterparty_address:
      e.assignedCounterparty === null ? null : e.assignedCounterparty.toBase58(),
    status,
    accept_deadline_unix: e.acceptDeadline.toNumber(),
    completion_duration_seconds: e.completionDurationSeconds.toNumber(),
    completion_deadline_unix: e.completionDeadline.toNumber(),
    approval_deadline_unix: e.approvalDeadline.toNumber(),
    dispute_bond_raw: e.disputeBond.toString(10),
    is_seeker: e.isSeeker,
    requires_approval: e.requiresApproval,
    unassign_window_seconds: e.unassignWindowSeconds.toNumber(),
    created_at_unix: e.createdAt.toNumber(),
  }
}
