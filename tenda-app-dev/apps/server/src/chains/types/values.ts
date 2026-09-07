/**
 * Primitive value types the adapter surface speaks: chain/account/asset ids and
 * the base-unit amount convention. No behaviour beyond the `AmountRaw` guard.
 */

import { isAmountRaw as isSharedAmountRaw } from '@tenda/shared'

// ---------- shared value types --------------------------------------------

/** CAIP-2 chain id, e.g. `'solana:mainnet'`, `'eip155:8453'`. */
export type ChainId = string

/** CAIP-10 account id, e.g. `'eip155:8453:0xabc...'`. */
export type CaipAccountId = string

/** Asset registry id (matches `assets.id`), e.g. `'USDC_BASE'`. */
export type AssetId = string

/** Stage 0 amount convention: numeric(78,0) as string in JS. */
export type AmountRaw = string

/**
 * Type guard for `AmountRaw`. The string must be a non-empty decimal integer
 * (no sign, no decimal point, no whitespace, no leading zeros except `'0'`
 * itself). Postgres `numeric(78,0)` accepts wider input than this, but every
 * Stage-0 producer (fee math, dispute bond, on-chain payloads) wants the
 * canonical form to avoid `BigInt('  42 ')` and other parser surprises. See
 * open_issues.md S0-6.
 */
export function isAmountRaw(value: unknown): value is AmountRaw {
  return isSharedAmountRaw(value)
}
