/**
 * Pure UnsignedTx → wallet-call translation for the admin dispute signer.
 * Deliberately free of any wallet SDK: the Reown-bound `providers/reown/signer`
 * is a thin imperative shell over these functions, so all the parsing/shaping
 * logic that can actually be wrong lives here and is unit-tested.
 */
import type { UnsignedTx } from '@tenda/shared'
import { UnsupportedChainError } from '@/lib/resolution-sign'

type Hex = `0x${string}`

/** Coerce a possibly-unprefixed hex string to a 0x-prefixed one. */
export function toHex(value: string): Hex {
  return (value.startsWith('0x') ? value : `0x${value}`) as Hex
}

/** Numeric EVM chain id from a CAIP-2 id (`eip155:84532` → 84532). */
export function evmChainId(chainId: string): number {
  const id = Number(chainId.split(':')[1])
  if (!Number.isInteger(id)) throw new UnsupportedChainError(chainId)
  return id
}

/** Wagmi `sendTransaction` parameters (minus the Config). */
export interface EvmSendArgs {
  chainId: number
  to: Hex
  data: Hex
  value: bigint
  gas?: bigint
}

/**
 * Build the exact Wagmi `sendTransaction` args for an EVM resolution tx. The
 * chainId is derived from the escrow's CAIP-2 id (never the wallet's current
 * network). resolveDispute carries no msg.value beyond `value`; the CELO
 * `fee_currency` hint is ignored (admin pays gas in native CELO).
 */
export function buildEvmSendArgs(
  chainId: string,
  unsigned: Extract<UnsignedTx, { kind: 'evm-tx' }>,
): EvmSendArgs {
  return {
    chainId: evmChainId(chainId),
    to: toHex(unsigned.to),
    data: toHex(unsigned.data),
    value: BigInt(unsigned.value),
    ...(unsigned.gas_limit !== undefined ? { gas: BigInt(unsigned.gas_limit) } : {}),
  }
}

/** Decode a base64 (browser `atob`) unsigned tx into raw bytes for web3.js. */
export function decodeBase64Tx(tx_base64: string): Uint8Array {
  return Uint8Array.from(atob(tx_base64), (c) => c.charCodeAt(0))
}
