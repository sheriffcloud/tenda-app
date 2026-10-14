/**
 * Minimal EVM JSON-RPC helpers shared by every client-side read path
 * (balance readers, mobile's allowance module) — moved from
 * apps/mobile/wallet/evm-rpc.ts, 2026-08-15; pure fetch, no dependencies.
 * Public RPC endpoints only: chain facts come from the manifest / chain
 * registry; the server's keyed RPC never leaks here.
 */
import { BALANCE_RPC_TIMEOUT_MS } from './balances/constants'

/**
 * One JSON-RPC call returning the `result`, or null on any error/miss.
 * Bounded by an AbortController timeout so a hung endpoint can't strand a
 * screen's loading state (see balances/constants for the shared read budget).
 */
export async function evmRpc(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BALANCE_RPC_TIMEOUT_MS)
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    })
    const body: unknown = await res.json()
    if (typeof body === 'object' && body !== null && 'result' in body) {
      return (body as { result: unknown }).result
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** As evmRpc, but only string results survive (eth_call, eth_getBalance…). */
export async function evmRpcString(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<string | null> {
  const result = await evmRpc(rpcUrl, method, params)
  return typeof result === 'string' ? result : null
}

/** Hex quantity (e.g. `0x1a2b`) → base-unit decimal string; 0 on empty/invalid. */
export function hexToDecimalString(hex: string | null): string {
  if (hex === null || hex === '0x' || hex === '') return '0'
  try {
    return BigInt(hex).toString()
  } catch {
    return '0'
  }
}

/** Left-pad a 20-byte address to a 32-byte ABI word (no 0x). */
export function addressWord(address: string): string {
  return address.replace(/^0x/, '').toLowerCase().padStart(64, '0')
}

/**
 * Left-pad a base-unit decimal amount to a 32-byte ABI word (no 0x).
 * Throws on amounts beyond uint256, padStart never truncates, so letting
 * one through would emit malformed calldata.
 */
export function amountWord(amountRaw: string): string {
  const word = BigInt(amountRaw).toString(16)
  if (word.length > 64) {
    throw new RangeError(`amount does not fit in uint256: ${amountRaw}`)
  }
  return word.padStart(64, '0')
}
