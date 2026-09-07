/**
 * EIP-2612 permit helpers, pure over their inputs (no RPC, no DB) so every
 * rule is unit-testable; the adapter supplies live token facts (name, nonce,
 * on-chain DOMAIN_SEPARATOR) read over its RPC.
 *
 * Design invariants:
 *   - The client NEVER constructs or hashes EIP-712, the server builds the
 *     full typed data and the wallet hashes it (`eth_signTypedData_v4`).
 *   - The reconstructed domain is verified against the token's on-chain
 *     DOMAIN_SEPARATOR before a payload is returned, so a token rename or
 *     upgrade degrades to the approve flow instead of yielding unsignable
 *     payloads (cUSD's non-standard domain is exactly this case).
 *   - The signed `value` is immutable inside the signature: the server
 *     validates it COVERS the transfer and rejects otherwise, it can never
 *     "fix" it.
 */

import { hashDomain, parseSignature } from 'viem'
import { ErrorCode, type PermitSignatureBody, type PermitTypedData } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { isAmountRaw, type AmountRaw } from '@server/chains/types'

/** Permit deadline horizon: long enough to sign, short enough to limit replay. */
export const PERMIT_DEADLINE_SECONDS = 15 * 60

/** The standard 5-field EIP712Domain, what USDC (FiatTokenV2) implements. */
const EIP712_DOMAIN_FIELDS = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
] as const

const PERMIT_FIELDS = [
  { name: 'owner', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
] as const

export interface ParsedPermitSignature {
  v: number
  r: `0x${string}`
  s: `0x${string}`
}

function fail(status: number, code: ErrorCode, message: string): never {
  throw new AppError(status, code, message)
}

/** Split a 65-byte 0x-hex signature into {v, r, s}; 422 on malformed input. */
export function parsePermitSignature(signature: string): ParsedPermitSignature {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    fail(422, ErrorCode.VALIDATION_ERROR, 'permit.signature must be a 65-byte 0x-hex string')
  }
  const sig = parseSignature(signature as `0x${string}`)
  // viem may return yParity-only for compact forms; permit() takes legacy v.
  const v = sig.v !== undefined ? Number(sig.v) : sig.yParity + 27
  return { v, r: sig.r, s: sig.s }
}

/**
 * Validate a permit body against the transfer it must cover, the pure field
 * checks routes run before building (the signed value is immutable, so the
 * server rejects rather than fixes). The native-asset rejection lives in the
 * builder, which is the layer that resolves the asset address.
 */
export function validatePermitBody(args: {
  permit: PermitSignatureBody
  /** Base-unit amount the contract will pull (escrow amount or bond). */
  transfer_amount_raw: AmountRaw
  now: Date
}): ParsedPermitSignature {
  const { permit, transfer_amount_raw, now } = args
  if (!isAmountRaw(permit.value_raw)) {
    fail(422, ErrorCode.VALIDATION_ERROR, 'permit.value_raw must be a canonical integer string')
  }
  if (BigInt(permit.value_raw) < BigInt(transfer_amount_raw)) {
    fail(
      422,
      ErrorCode.VALIDATION_ERROR,
      'permit.value_raw is below the transfer amount, the signed value cannot cover it',
    )
  }
  if (!Number.isInteger(permit.deadline_unix)) {
    fail(422, ErrorCode.VALIDATION_ERROR, 'permit.deadline_unix must be an integer unix timestamp')
  }
  if (permit.deadline_unix <= Math.floor(now.getTime() / 1000)) {
    fail(422, ErrorCode.VALIDATION_ERROR, 'permit.deadline_unix has already passed')
  }
  return parsePermitSignature(permit.signature)
}

/**
 * Parse + validate a wire `permit` body in one step (shape, then semantics
 * against the transfer). Shared by the create and dispute routes so the
 * rules can't drift between them. Returns the typed body for the adapter
 * payload; the builder re-derives {v,r,s} at encode time.
 */
export function validateWirePermit(args: {
  raw: unknown
  transfer_amount_raw: AmountRaw
  now: Date
}): PermitSignatureBody {
  const { raw, transfer_amount_raw, now } = args
  if (!isRecord(raw)) {
    fail(422, ErrorCode.VALIDATION_ERROR, 'permit must be an object')
  }
  if (typeof raw.value_raw !== 'string') {
    fail(422, ErrorCode.VALIDATION_ERROR, 'permit.value_raw must be a string')
  }
  if (typeof raw.deadline_unix !== 'number') {
    fail(422, ErrorCode.VALIDATION_ERROR, 'permit.deadline_unix must be a number')
  }
  if (typeof raw.signature !== 'string') {
    fail(422, ErrorCode.VALIDATION_ERROR, 'permit.signature must be a string')
  }
  const permit: PermitSignatureBody = {
    value_raw: raw.value_raw,
    deadline_unix: raw.deadline_unix,
    signature: raw.signature,
  }
  validatePermitBody({ permit, transfer_amount_raw, now })
  return permit
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Assemble the full eth_signTypedData_v4 payload. Pure constructor. */
export function buildPermitTypedData(args: {
  token_name: string
  permit_version: string
  /** Numeric chain id (the eip155 reference), e.g. 84532. */
  chain_numeric_id: number
  token: string
  owner: string
  spender: string
  value_raw: AmountRaw
  nonce: bigint
  deadline_unix: number
}): PermitTypedData {
  return {
    types: {
      EIP712Domain: [...EIP712_DOMAIN_FIELDS],
      Permit: [...PERMIT_FIELDS],
    },
    primaryType: 'Permit',
    domain: {
      name: args.token_name,
      version: args.permit_version,
      chainId: args.chain_numeric_id,
      verifyingContract: args.token,
    },
    message: {
      owner: args.owner,
      spender: args.spender,
      value: args.value_raw,
      nonce: args.nonce.toString(),
      deadline: String(args.deadline_unix),
    },
  }
}

/**
 * True iff the typed data's domain hashes to the token's live
 * DOMAIN_SEPARATOR, the runtime guard that keeps config-declared permit
 * support honest against the actual deployed token.
 */
export function permitDomainMatches(
  typed_data: PermitTypedData,
  onchain_domain_separator: string,
): boolean {
  const computed = hashDomain({
    domain: {
      name: typed_data.domain.name,
      version: typed_data.domain.version,
      chainId: BigInt(typed_data.domain.chainId),
      verifyingContract: typed_data.domain.verifyingContract as `0x${string}`,
    },
    // hashDomain hashes over the declared field list, pass OUR domain type
    // so the check hashes exactly what wallets will hash from typed_data.
    types: { EIP712Domain: [...EIP712_DOMAIN_FIELDS] },
  })
  return computed.toLowerCase() === onchain_domain_separator.toLowerCase()
}

/** The eip155 numeric reference of a CAIP-2 id ('eip155:84532' → 84532). */
export function evmNumericChainId(chain_id: string): number {
  const reference = chain_id.split(':')[1] ?? ''
  const numeric = Number(reference)
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`'${chain_id}' is not an eip155 CAIP-2 id`)
  }
  return numeric
}
