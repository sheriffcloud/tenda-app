/**
 * Validation and normalization for POST /v1/escrows.
 *
 * Pure module, no DB, no chain I/O, so every rule is unit-testable. The
 * route supplies caller identity and persistence; the on-chain program
 * re-validates everything that matters financially (this layer exists to
 * fail fast with typed errors, not to be the security boundary).
 */

import {
  AMOUNT_RAW_PRECISION,
  ErrorCode,
  isValidAcceptWindow,
  isValidCompletionDuration,
  MAX_ACCEPT_WINDOW_SECONDS,
  MAX_COMPLETION_DURATION_SECONDS,
  MIN_ACCEPT_WINDOW_SECONDS,
  MIN_COMPLETION_DURATION_SECONDS,
  type PermitSignatureBody,
} from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { assertGigAsset, assertExchangeAsset } from '@server/lib/escrow'
import { validateWirePermit } from '@server/chains/evm/permit'
import { isAmountRaw, type AmountRaw, type AssetId, type ChainId } from '@server/chains/types'
import { isUuidLike } from '@server/lib/uuid'

export interface CreateEscrowBody {
  creation_operation_id?: unknown
  kind?: unknown
  chain_id?: unknown
  asset?: unknown
  amount_raw?: unknown
  accept_window_seconds?: unknown
  completion_duration_seconds?: unknown
  dispute_bond_raw?: unknown
  assigned_counterparty_id?: unknown
  /** Approval mode: only the creator can move the escrow, via assign. */
  requires_approval?: unknown
  /** EIP-2612 signature riding the create (EVM ERC-20 assets only). */
  permit?: unknown
  /** Forbidden, server generates ids (stage-0 exit criterion). */
  id?: unknown
}

export interface ValidatedCreateEscrow {
  creation_operation_id: string | null
  kind: 'gig' | 'exchange'
  chain_id: ChainId
  asset: AssetId
  amount_raw: AmountRaw
  accept_window_seconds: number
  completion_duration_seconds: number
  dispute_bond_raw: AmountRaw
  assigned_counterparty_id: string | null
  requires_approval: boolean
  permit: PermitSignatureBody | null
}

export interface ValidateCreateDeps {
  /** Registry membership check, unknown chains fail fast. */
  hasChain(chain_id: ChainId): boolean
  /** Injected clock for deterministic deadline tests. */
  now(): Date
  /** Caller identity, assigned counterparty must differ. */
  caller_user_id: string
}

function fail(message: string): never {
  throw new AppError(422, ErrorCode.VALIDATION_ERROR, message)
}

export function validateCreateEscrow(
  deps: ValidateCreateDeps,
  body: CreateEscrowBody,
): ValidatedCreateEscrow {
  if (body.id !== undefined) {
    // Server-generated ids only, a client-supplied id could front-run the
    // PDA derivation of someone else's draft.
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'id is server-generated; do not supply one',
    )
  }

  const creation_operation_id = body.creation_operation_id === undefined
    ? null
    : typeof body.creation_operation_id === 'string' && isUuidLike(body.creation_operation_id)
      ? body.creation_operation_id
      : fail('creation_operation_id must be a UUID')

  const kind = body.kind
  if (kind !== 'gig' && kind !== 'exchange') fail("kind must be 'gig' or 'exchange'")

  if (typeof body.chain_id !== 'string' || body.chain_id === '') fail('chain_id is required')
  const chain_id = body.chain_id
  if (!deps.hasChain(chain_id)) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, `unsupported chain_id '${chain_id}'`)
  }

  if (typeof body.asset !== 'string' || body.asset === '') fail('asset is required')
  const asset = body.asset
  if (kind === 'gig') assertGigAsset(asset, chain_id)
  else assertExchangeAsset(asset, chain_id)

  if (!isAmountRaw(body.amount_raw)) fail('amount_raw must be a canonical integer string')
  const amount_raw = body.amount_raw
  if (amount_raw === '0') fail('amount_raw must be positive')
  if (amount_raw.length > AMOUNT_RAW_PRECISION) {
    fail(`amount_raw exceeds the maximum precision of ${AMOUNT_RAW_PRECISION} digits`)
  }

  const dispute_bond_raw = body.dispute_bond_raw ?? '0'
  if (!isAmountRaw(dispute_bond_raw)) {
    fail('dispute_bond_raw must be a canonical integer string')
  }
  if (dispute_bond_raw.length > AMOUNT_RAW_PRECISION) {
    fail(`dispute_bond_raw exceeds the maximum precision of ${AMOUNT_RAW_PRECISION} digits`)
  }

  // A DURATION, not an instant (#41). The caller cannot author a moment that
  // is still in the future by the time the transaction is built — a draft may
  // sit for days — so the server derives the deadline at build and the caller
  // owns only how long the window should be.
  //
  // Bounded through the SAME predicate the pickers offer, so the clients and
  // the API cannot disagree. The old absolute field had no ceiling at all:
  // `Date.now()` in milliseconds passed as a unix second, and a year-58,633
  // deadline was minted as a draft (#40, dissolved by this shape).
  // Split the way `completion_duration_seconds` below splits it: the first
  // message names the CONDITION that failed (not a number), the second owns the
  // RANGE and says so precisely. Collapsing them tells a caller who sent
  // "tomorrow" about a range, which is not their problem.
  if (typeof body.accept_window_seconds !== 'number') {
    fail('accept_window_seconds must be a number')
  }
  if (!isValidAcceptWindow(body.accept_window_seconds)) {
    fail(
      `accept_window_seconds must be an integer between ${MIN_ACCEPT_WINDOW_SECONDS} and ${MAX_ACCEPT_WINDOW_SECONDS}`,
    )
  }
  const accept_window_seconds = body.accept_window_seconds

  // BOUNDED, not merely positive. The bound is the PRODUCT rail — the same
  // 90 days both composers offer, through the same shared predicate, so the
  // clients and the API can never disagree about it (#52).
  //
  // What makes bounding it mandatory is the CHAIN: both contracts carry
  // ESCROW_LIMITS.maxCompletionDurationSeconds (180 days), and ESCROW_LIMITS
  // exists so off-chain validation "can never be looser than what the chain
  // accepts". Unbounded here, a caller posting ~3.2 years got a draft row and
  // a transaction to sign, and the refusal arrived from the chain AFTER the
  // signature. 90 < 180, so satisfying the product rail satisfies the
  // protocol one with room to spare.
  //
  // The consequence, accepted deliberately: moving the product rail is now a
  // SERVER deploy, not a client-only one.
  if (typeof body.completion_duration_seconds !== 'number') {
    fail('completion_duration_seconds must be a number')
  }
  if (!isValidCompletionDuration(body.completion_duration_seconds)) {
    fail(
      `completion_duration_seconds must be an integer between ${MIN_COMPLETION_DURATION_SECONDS} and ${MAX_COMPLETION_DURATION_SECONDS}`,
    )
  }
  const completion_duration_seconds = body.completion_duration_seconds

  let assigned_counterparty_id: string | null = null
  if (body.assigned_counterparty_id !== undefined && body.assigned_counterparty_id !== null) {
    if (typeof body.assigned_counterparty_id !== 'string' || body.assigned_counterparty_id === '') {
      fail('assigned_counterparty_id must be a user id')
    }
    if (body.assigned_counterparty_id === deps.caller_user_id) {
      fail('assigned_counterparty_id cannot be the creator')
    }
    assigned_counterparty_id = body.assigned_counterparty_id
  }

  let requires_approval = false
  if (body.requires_approval !== undefined && body.requires_approval !== null) {
    if (typeof body.requires_approval !== 'boolean') {
      fail('requires_approval must be a boolean')
    }
    requires_approval = body.requires_approval
  }
  if (requires_approval) {
    // Approval mode is a hiring flow: a P2P trade has nobody to approve, and
    // the exchange screens have no applicant surface to assign from.
    if (kind !== 'gig') {
      fail('requires_approval applies to gigs only')
    }
    // Mirrors the contracts, which reject the pair outright — the three modes
    // are mutually exclusive, and assign could otherwise name someone other
    // than the invitee, leaving assigned_counterparty as dead state.
    if (assigned_counterparty_id !== null) {
      fail('requires_approval cannot be combined with a directly assigned worker')
    }
  }

  // Field-level permit checks are pure and live here; the route enforces
  // the namespace (eip155 only) and the builder rejects native assets.
  const permit =
    body.permit !== undefined && body.permit !== null
      ? validateWirePermit({ raw: body.permit, transfer_amount_raw: amount_raw, now: deps.now() })
      : null

  return {
    creation_operation_id,
    kind,
    chain_id,
    asset,
    amount_raw,
    accept_window_seconds,
    completion_duration_seconds,
    dispute_bond_raw,
    assigned_counterparty_id,
    requires_approval,
    permit,
  }
}
