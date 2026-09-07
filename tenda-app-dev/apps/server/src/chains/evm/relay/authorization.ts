/**
 * EIP-3009 `ReceiveWithAuthorization` — the typed data an agent signs to fund
 * an escrow through the relayer, and the checks a returned signature must
 * pass. Pure over its inputs (no RPC, no DB), like ./permit.
 *
 * What the signature binds is decided by the CONTRACT (createEscrowFor):
 * `to` is the escrow contract, `value` is params.amount, `nonce` is the hash
 * of the whole CreateParams. This module states the same three so the
 * relayer refuses a mismatch before broadcasting rather than after a revert.
 */
import { getAddress, keccak256, toBytes, verifyTypedData } from 'viem'
import {
  RELAY_MIN_REMAINING_SECONDS,
  sameWalletAddress,
  type EvmAuthorizationPayment,
  type ReceiveAuthorizationTypedData,
  type RelayPaymentPayload,
} from '@tenda/shared'
import { isRecord } from '@server/lib/validation'
import { assertRelayEnvelope, relayRejected as reject } from '@server/lib/x402'
import { isAmountRaw } from '@server/chains/types'
import { EIP712_DOMAIN_FIELDS, splitSignature } from '../permit'

const RECEIVE_WITH_AUTHORIZATION_FIELDS = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'nonce', type: 'bytes32' },
] as const

/**
 * The typehash FiatTokenV2 publishes as RECEIVE_WITH_AUTHORIZATION_TYPEHASH.
 * A token whose constant differs (or is absent) does not implement the
 * authorization this module builds — the live probe compares against this.
 */
export const RECEIVE_WITH_AUTHORIZATION_TYPEHASH: `0x${string}` = keccak256(
  toBytes(
    'ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)',
  ),
)

export interface AuthorizationTerms {
  token_name: string
  version: string
  chain_numeric_id: number
  token: string
  from: string
  to: string
  value_raw: string
  valid_after: bigint
  valid_before: bigint
  nonce: `0x${string}`
}

/** Assemble the full eth_signTypedData_v4 payload. Pure constructor. */
export function buildAuthorizationTypedData(t: AuthorizationTerms): ReceiveAuthorizationTypedData {
  return {
    types: {
      EIP712Domain: [...EIP712_DOMAIN_FIELDS],
      ReceiveWithAuthorization: [...RECEIVE_WITH_AUTHORIZATION_FIELDS],
    },
    primaryType: 'ReceiveWithAuthorization',
    domain: {
      name: t.token_name,
      version: t.version,
      chainId: t.chain_numeric_id,
      verifyingContract: t.token,
    },
    message: {
      from: t.from,
      to: t.to,
      value: t.value_raw,
      validAfter: t.valid_after.toString(),
      validBefore: t.valid_before.toString(),
      nonce: t.nonce,
    },
  }
}

export interface ParsedAuthorization {
  from: `0x${string}`
  to: `0x${string}`
  value: bigint
  valid_after: bigint
  valid_before: bigint
  nonce: `0x${string}`
  v: number
  r: `0x${string}`
  s: `0x${string}`
  signature: `0x${string}`
}

function isAuthorizationPayment(p: RelayPaymentPayload['payload']): p is EvmAuthorizationPayment {
  return isRecord(p) && 'authorization' in p && 'signature' in p
}

const UINT_TEXT = /^(0|[1-9]\d*)$/

/**
 * The artifact against the terms this draft yields NOW. Every mismatch is a
 * RELAY_REJECTED naming the field — the contract would revert on the same
 * mismatch, but a relayer that broadcasts first pays gas to learn that.
 */
export function validateAuthorizationPayment(args: {
  payment: RelayPaymentPayload
  expected: { network: string; from: string; to: string; value_raw: string; nonce: `0x${string}` }
  now_unix: number
}): ParsedAuthorization {
  const { payment, expected } = args
  assertRelayEnvelope(payment, expected.network)
  if (!isAuthorizationPayment(payment.payload)) {
    reject('payload must carry an EIP-3009 authorization and its signature')
  }
  const a = payment.payload.authorization
  if (!isRecord(a)) reject('authorization must be an object')
  const { from, to, value, validAfter, validBefore, nonce } = a
  const { signature } = payment.payload
  if (typeof from !== 'string' || !sameWalletAddress('eip155', from, expected.from)) {
    reject(`authorization.from must be the creator ${expected.from}`)
  }
  if (typeof to !== 'string' || !sameWalletAddress('eip155', to, expected.to)) {
    reject(`authorization.to must be the escrow contract ${expected.to}`)
  }
  if (typeof value !== 'string' || !isAmountRaw(value) || value !== expected.value_raw) {
    reject(`authorization.value must be the escrow amount ${expected.value_raw}`)
  }
  if (typeof nonce !== 'string' || nonce.toLowerCase() !== expected.nonce.toLowerCase()) {
    reject('authorization.nonce must be the hash of the quoted create parameters')
  }
  if (typeof validAfter !== 'string' || !UINT_TEXT.test(validAfter)) {
    reject('authorization.validAfter must be a unix timestamp string')
  }
  if (typeof validBefore !== 'string' || !UINT_TEXT.test(validBefore)) {
    reject('authorization.validBefore must be a unix timestamp string')
  }
  const valid_after = BigInt(validAfter)
  const valid_before = BigInt(validBefore)
  const now = BigInt(args.now_unix)
  // The token's window is exclusive at both ends (validAfter < now < validBefore).
  if (valid_after >= now) reject('authorization is not yet valid (validAfter has not passed)')
  if (valid_before <= now + BigInt(RELAY_MIN_REMAINING_SECONDS)) {
    reject(`authorization expires within ${RELAY_MIN_REMAINING_SECONDS}s — request fresh terms`)
  }
  if (typeof signature !== 'string') reject('signature must be a 65-byte 0x-hex string')
  // The permit's splitter: same shape rule, same parse guard, same v-mapping.
  const split = splitSignature(signature, (reason) => reject(`signature ${reason}`))
  return {
    // Canonical EIP-55 form: `from` was matched case-insensitively (an address
    // is 20 bytes, its hex casing is not identity) but viem's ABI encoder
    // refuses a non-checksummed mixed/upper-case spelling — which would turn a
    // valid artifact into a 500 at calldata time. Safe: sameWalletAddress
    // above already proved it is a well-formed address.
    from: getAddress(from),
    to: to as `0x${string}`,
    value: BigInt(value),
    valid_after,
    valid_before,
    nonce: nonce as `0x${string}`,
    ...split,
    signature: signature as `0x${string}`,
  }
}

/**
 * Does `signature` recover to `from` over exactly this typed data? Offline
 * ecrecover — an EOA agent key, which is what a relayed create is for.
 * (A contract wallet would need EIP-1271 and could pay its own gas anyway.)
 */
export function verifyAuthorizationSignature(
  typed_data: ReceiveAuthorizationTypedData,
  signature: `0x${string}`,
  from: `0x${string}`,
): Promise<boolean> {
  return verifyTypedData({
    address: from,
    domain: {
      name: typed_data.domain.name,
      version: typed_data.domain.version,
      chainId: typed_data.domain.chainId,
      verifyingContract: typed_data.domain.verifyingContract as `0x${string}`,
    },
    types: { ReceiveWithAuthorization: [...RECEIVE_WITH_AUTHORIZATION_FIELDS] },
    primaryType: 'ReceiveWithAuthorization',
    message: {
      from: typed_data.message.from as `0x${string}`,
      to: typed_data.message.to as `0x${string}`,
      value: BigInt(typed_data.message.value),
      validAfter: BigInt(typed_data.message.validAfter),
      validBefore: BigInt(typed_data.message.validBefore),
      nonce: typed_data.message.nonce as `0x${string}`,
    },
    signature,
  })
}
