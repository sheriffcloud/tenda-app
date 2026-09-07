/**
 * EVM receipt → DecodedEvent (stage-3-base.md § EVM adapter). The contract
 * event names ARE the wire event vocabulary (chains/types.ts
 * ESCROW_EVENTS), so decoding is decodeEventLog + a defensive narrow, no
 * rename table like the Solana coder path needs.
 */

import { decodeEventLog } from 'viem'
import { DISPUTE_WINNER_CODE } from '@tenda/shared'
import { bytesToUuid } from '@server/chains/ids'
import { ESCROW_EVENTS, type DecodedEvent, type EscrowEvent } from '@server/chains/types'
import { ESCROW_EVM_ABI } from './rpc'
import type { EvmReceiptLog } from './rpc'

/**
 * uint8 winner code → cross-chain winner name ('creator'|'counterparty'|
 * 'split'). The Anchor coder renders the enum VARIANT so Solana fields carry
 * the name; the Solidity event can only carry the code — translate here so
 * applyEscrowEvent's narrowWinner sees one vocabulary.
 */
const WINNER_NAME_BY_CODE = new Map(
  Object.entries(DISPUTE_WINNER_CODE).map(([name, code]) => [String(code), name]),
)

function isEscrowEvent(name: string): name is EscrowEvent {
  return (ESCROW_EVENTS as readonly string[]).includes(name)
}

/** bytes16 hex (0x + 32 chars) → canonical UUID string. */
export function escrowIdHexToUuid(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  return bytesToUuid(Buffer.from(clean, 'hex'))
}

/**
 * Decode every escrow-contract log in a receipt into wire events. Logs
 * from other contracts (ERC-20 Transfer etc.) and unknown topics are
 * skipped silently, a receipt is allowed to contain foreign noise.
 *
 * Takes the chain's KNOWN contracts, not just the current one. Scoping this to
 * a single address is what made a redeploy silently destructive: a transaction
 * against the superseded contract decoded to nothing, which `verifyTx` reported
 * as a failed transaction, which `verify-tx` recorded as `TX_FAILED` — a
 * permanent lie about a transaction that had in fact succeeded on chain
 * (open_issues #89). Matching any deployed contract of ours, and reporting
 * WHICH, is what makes an escrow funded by an older contract still verifiable.
 *
 * The set is the allow-list from `chain_contracts`, never "any contract that
 * happens to match our ABI" — a look-alike contract must not be able to write
 * events onto our escrows.
 */
export function decodeEscrowLogs(
  logs: EvmReceiptLog[],
  escrow_contracts: readonly string[],
  chain_id: string,
): DecodedEvent[] {
  const out: DecodedEvent[] = []
  const targets = new Set(escrow_contracts.map((c) => c.toLowerCase()))

  for (const log of logs) {
    const emitter = log.address.toLowerCase()
    if (!targets.has(emitter)) continue
    let decoded: { eventName: string; args: unknown }
    try {
      decoded = decodeEventLog({
        abi: ESCROW_EVM_ABI,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      })
    } catch {
      continue // topic not in our ABI, foreign/unknown log
    }
    if (!isEscrowEvent(decoded.eventName)) continue

    const args = (decoded.args ?? {}) as Record<string, unknown>
    const escrowIdRaw = args.escrowId
    if (typeof escrowIdRaw !== 'string') continue

    // Stringify every arg so uint256 amounts survive (mirrors the Solana
    // decoder's contract: DecodedEvent.fields are strings). `escrowId` is
    // rendered canonically as `escrow_id` (the UUID), the key applyEscrowEvent
    // and the Solana decoder both use, so the raw bytes16 form is dropped.
    const fields: Record<string, string> = { escrow_id: escrowIdHexToUuid(escrowIdRaw) }
    for (const [k, v] of Object.entries(args)) {
      if (k === 'escrowId') continue
      fields[k] = typeof v === 'bigint' ? v.toString() : String(v)
    }
    if (decoded.eventName === 'DisputeResolved' && fields.winner !== undefined) {
      fields.winner = WINNER_NAME_BY_CODE.get(fields.winner) ?? fields.winner
    }

    const actorRaw = actorOf(decoded.eventName, args)
    out.push({
      name: decoded.eventName,
      escrow_ref: escrowIdRaw,
      // The emitting address, already normalised (lower-cased) by the membership
      // test above — this is what stamps `escrows.escrow_contract`, so it must be
      // the chain's own account of which contract holds the escrow.
      contract: emitter,
      ...(actorRaw !== null ? { actor: `${chain_id}:${actorRaw}` as DecodedEvent['actor'] } : {}),
      fields,
    })
  }
  return out
}

/**
 * Which decoded field names the acting wallet for each event, `null` where no
 * single party acts (DisputeResolved is admin-initiated).
 *
 * An exhaustive `Record`, matching the Solana decoder's `ACTOR_FIELD` exactly.
 * This was a nested ternary chain that fell through to `null`, so a new event
 * silently produced escrow_transactions rows with no actor; now the build
 * breaks until the event is classified. Field names are the Solidity event arg
 * names, which the ABI decoder returns verbatim.
 */
const ACTOR_FIELD: Record<EscrowEvent, string | null> = {
  EscrowCreated: 'creator',
  EscrowAccepted: 'counterparty',
  EscrowDeclined: 'declined_by',
  CounterpartyAssigned: 'assigned_by',
  AssignmentReleased: 'released_by',
  // No actor on EVM: the Solidity ProofSubmitted carries only the proof hash
  // and deadlines, while the Anchor event also carries `counterparty`. A real
  // cross-chain asymmetry, preserved here rather than invented — the submitter
  // is always the escrow's counterparty, which the row already records.
  ProofSubmitted: null,
  EscrowApproved: 'creator',
  PaymentClaimed: 'counterparty',
  EscrowCancelled: 'creator',
  EscrowExpired: 'creator',
  EscrowAbandoned: 'creator',
  DisputeRaised: 'raised_by',
  DisputeResolved: null,
}

/** The event arg that identifies the acting wallet, when one exists. */
function actorOf(name: EscrowEvent, args: Record<string, unknown>): string | null {
  const key = ACTOR_FIELD[name]
  if (key === null) return null
  const v = args[key]
  return typeof v === 'string' ? v : null
}
