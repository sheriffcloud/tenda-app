/**
 * The contract's `CreateParams` struct, built ONCE for every path that needs
 * it: the plain/permit create calls (builders.ts) and the relayed create
 * (relay/), whose EIP-3009 nonce is the keccak256 of this exact struct.
 * Two builders of the same struct is how the nonce the relayer expects and
 * the params it submits would come to differ.
 *
 * The tuple layout is read off the shared ABI (createEscrow's one input)
 * rather than restated here, so the nonce hashes whatever the contract
 * declares — a field added to the Solidity struct changes the ABI and this
 * encoding together.
 */

import { encodeAbiParameters, keccak256, toHex, type AbiFunction, type AbiParameter } from 'viem'
import { ESCROW_KIND_CODE, type EvmCreateParamsWire } from '@tenda/shared'
import { uuidToBytes } from '@server/chains/ids'
import type { CreateEscrowPayload } from '@server/chains/types'
import { ESCROW_EVM_ABI, ZERO_ADDRESS } from './rpc'

export interface EvmCreateParams {
  escrowId: `0x${string}`
  kind: number
  asset: `0x${string}`
  amount: bigint
  assignedCounterparty: `0x${string}`
  acceptDeadline: bigint
  completionDuration: bigint
  disputeBond: bigint
  isSeeker: boolean
  requiresApproval: boolean
  unassignWindowSeconds: bigint
}

/** The addresses a create-time struct needs resolved before it can be built. */
export interface CreateParamsContext {
  asset_address: string | null
  assigned_counterparty_address: string | null
}

/**
 * A uuid escrow id as the contract's `bytes16` ref. Kept HERE rather than in
 * chains/ids.ts: that module is deliberately chain-agnostic and viem-free,
 * while `toHex` is viem. One EVM-side encoder, every caller.
 */
export function escrowIdHex(escrow_id: string): `0x${string}` {
  return toHex(uuidToBytes(escrow_id))
}

function asAddress(v: string | null): `0x${string}` {
  return (v ?? ZERO_ADDRESS) as `0x${string}`
}

/** The struct's ABI components, from the contract's own `createEscrow(params)` — module-private: the nonce below is the only consumer. */
function createParamsAbi(): AbiParameter {
  const fn = ESCROW_EVM_ABI.find(
    (item): item is AbiFunction => item.type === 'function' && item.name === 'createEscrow',
  )
  const input = fn?.inputs[0]
  if (input === undefined || input.type !== 'tuple') {
    throw new Error('TendaEscrow ABI: createEscrow(params) tuple input not found')
  }
  return input
}

const CREATE_PARAMS_ABI: AbiParameter = createParamsAbi()

/** One `CreateParams` struct, mirroring the contract — named fields, so a
 *  create-time field can never silently shift an argument. */
export function buildCreateParams(p: CreateEscrowPayload, ctx: CreateParamsContext): EvmCreateParams {
  return {
    escrowId: escrowIdHex(p.escrow_id),
    kind: ESCROW_KIND_CODE[p.kind],
    asset: asAddress(ctx.asset_address),
    amount: BigInt(p.amount_raw),
    assignedCounterparty: asAddress(ctx.assigned_counterparty_address),
    acceptDeadline: BigInt(p.accept_deadline_unix),
    completionDuration: BigInt(p.completion_duration_seconds),
    disputeBond: BigInt(p.dispute_bond_raw),
    isSeeker: p.is_seeker,
    requiresApproval: p.requires_approval,
    unassignWindowSeconds: BigInt(p.unassign_window_seconds),
  }
}

/**
 * The EIP-3009 nonce the contract derives: `keccak256(abi.encode(params))`
 * (TendaEscrow.authorizationNonce). Every field of the struct is static, so
 * `abi.encode` of the struct is the in-place tuple encoding viem produces
 * here — proven against the contract's own view in the anvil suite.
 */
export function authorizationNonce(params: EvmCreateParams): `0x${string}` {
  return keccak256(encodeAbiParameters([CREATE_PARAMS_ABI], [params]))
}

/** The struct as the 402 terms show it — every integer a decimal string. */
export function createParamsWire(params: EvmCreateParams): EvmCreateParamsWire {
  return {
    escrowId: params.escrowId,
    kind: params.kind,
    asset: params.asset,
    amount: params.amount.toString(),
    assignedCounterparty: params.assignedCounterparty,
    acceptDeadline: params.acceptDeadline.toString(),
    completionDuration: params.completionDuration.toString(),
    disputeBond: params.disputeBond.toString(),
    isSeeker: params.isSeeker,
    requiresApproval: params.requiresApproval,
    unassignWindowSeconds: params.unassignWindowSeconds.toString(),
  }
}
