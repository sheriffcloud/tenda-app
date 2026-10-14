/**
 * Coinbase Paymaster integration (stage-3-base.md § Coinbase Paymaster).
 *
 * The hosted endpoint speaks ERC-4337 JSON-RPC: `pm_sponsorUserOperation`
 * fills the paymaster fields + gas limits for a UserOperation we assemble
 * around the escrow calldata. Gated on the chain's PAYMASTER_URL secret (#47):
 * without it the adapter never offers sponsorship and falls back to a regular
 * tx, the documented degradation ("you'll pay a small fee").
 *
 * EOA mode: the client signs the userOpHash with personal_sign; nonce and
 * init_code are bundler-resolved fields the client fills via its 4337 SDK.
 * The server's job is ONLY the sponsored skeleton.
 */

import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { UserOperation } from '@server/chains/types'

/** ERC-4337 v0.6 EntryPoint, canonical address on BASE (and most chains). */
export const ENTRY_POINT_V06 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const

export interface PaymasterSponsorResult {
  paymaster_and_data: `0x${string}`
  pre_verification_gas: `0x${string}`
  verification_gas_limit: `0x${string}`
  call_gas_limit: `0x${string}`
}

/** HTTP seam, tests inject a fake; production posts JSON-RPC. */
export interface PaymasterHttp {
  sponsorUserOperation(
    user_op: Partial<UserOperation>,
    entry_point: string,
  ): Promise<PaymasterSponsorResult>
}

export function fetchPaymasterHttp(url: string, timeout_ms = 15_000): PaymasterHttp {
  return {
    async sponsorUserOperation(user_op, entry_point) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'pm_sponsorUserOperation',
          params: [toRpcUserOp(user_op), entry_point],
        }),
        signal: AbortSignal.timeout(timeout_ms),
      })
      if (!res.ok) {
        throw new AppError(502, ErrorCode.PROVIDER_UNAVAILABLE, `paymaster responded ${res.status}`)
      }
      const body = (await res.json()) as {
        result?: {
          paymasterAndData?: string
          preVerificationGas?: string
          verificationGasLimit?: string
          callGasLimit?: string
        }
        error?: { message?: string }
      }
      // JSON-RPC 2.0 omits `error` on success, but many servers send
      // `error: null`, treat null AND undefined as "no error" (`!= null`)
      // so a valid result alongside an explicit null error isn't rejected.
      if (body.error != null || body.result === undefined) {
        throw new AppError(
          502,
          ErrorCode.PROVIDER_UNAVAILABLE,
          body.error?.message ?? 'paymaster rejected the sponsorship',
        )
      }
      const r = body.result
      if (
        typeof r.paymasterAndData !== 'string' ||
        typeof r.preVerificationGas !== 'string' ||
        typeof r.verificationGasLimit !== 'string' ||
        typeof r.callGasLimit !== 'string'
      ) {
        throw new AppError(502, ErrorCode.PROVIDER_UNAVAILABLE, 'paymaster response missing gas fields')
      }
      return {
        paymaster_and_data: r.paymasterAndData as `0x${string}`,
        pre_verification_gas: r.preVerificationGas as `0x${string}`,
        verification_gas_limit: r.verificationGasLimit as `0x${string}`,
        call_gas_limit: r.callGasLimit as `0x${string}`,
      }
    },
  }
}

/** snake_case wire shape → the camelCase 4337 RPC field names. */
function toRpcUserOp(op: Partial<UserOperation>): Record<string, string> {
  const entries: Array<[keyof UserOperation, string]> = [
    ['sender', 'sender'],
    ['nonce', 'nonce'],
    ['init_code', 'initCode'],
    ['call_data', 'callData'],
    ['call_gas_limit', 'callGasLimit'],
    ['verification_gas_limit', 'verificationGasLimit'],
    ['pre_verification_gas', 'preVerificationGas'],
    ['max_fee_per_gas', 'maxFeePerGas'],
    ['max_priority_fee_per_gas', 'maxPriorityFeePerGas'],
    ['paymaster_and_data', 'paymasterAndData'],
    ['signature', 'signature'],
  ]
  const out: Record<string, string> = {}
  for (const [snake, camel] of entries) {
    const v = op[snake]
    if (v !== undefined) out[camel] = v
  }
  return out
}
