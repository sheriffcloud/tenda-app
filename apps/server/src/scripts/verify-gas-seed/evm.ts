/**
 * The EVM arm of the gas-seed audit (#53b item 3).
 *
 * Without it the EVM rail shipped with no on-chain proof at all — the script
 * parsed SystemProgram instructions and its error text named `CHAIN_SOLANA_*`,
 * so a funded 0G hot wallet had nothing checking that its grants were real.
 *
 * MUCH simpler than the Solana arm, and that is a property of the chain rather
 * than of the code: a native EVM transfer IS the transaction — `from`, `to` and
 * `value` are fields on it, with no instruction list to decode. What has to be
 * checked is the same list either way: the transfer happened, it succeeded, the
 * right wallet paid, the right wallet was paid, and the amount matches the row.
 */

import { getAddress } from 'viem'
import type { CheckResult, GrantRow } from './shared'
import { expectedFunder, unfinishedResult } from './shared'

/** One transaction, as this audit needs it. Null = unknown to the node. */
export interface EvmTxView {
  status: 'success' | 'reverted'
  from: string
  to: string | null
  value: bigint
}

export type FetchEvmTx = (tx_ref: string) => Promise<EvmTxView | null>

/**
 * EIP-55 casing is cosmetic, and the two sides of every comparison here come
 * from different places — a receipt (lower-cased by most nodes) and a database
 * row (whatever spelling a client sent). Comparing them raw reports a match as
 * a mismatch, which on this surface reads as "someone else funded this grant".
 */
function sameAddress(a: string, b: string): boolean {
  try {
    return getAddress(a.toLowerCase()) === getAddress(b.toLowerCase())
  } catch {
    // A malformed address on either side is not equal to anything, and saying
    // so beats throwing out of an audit that is reporting on many grants.
    return false
  }
}

/**
 * Verify one EVM grant against the chain. Never throws — a failure becomes a
 * failing RESULT, so one unreachable transaction cannot end the whole audit.
 */
export async function checkEvmGrant(
  fetchTx: FetchEvmTx,
  grant: GrantRow,
  chainFunder: string,
): Promise<CheckResult> {
  const base = { user_id: grant.user_id, chain_id: grant.chain_id, tx_ref: grant.tx_ref }
  // Anything not `delivered` has no confirmed transaction to inspect; the
  // detail text distinguishes "never signed" from "gave up asking".
  const unfinished = unfinishedResult(grant)
  if (unfinished !== null) return unfinished

  try {
    // Narrowed, not asserted: `delivered` always carries a reference, but the
    // column is nullable and a hand-repaired row could contradict that.
    if (grant.tx_ref === null) {
      return { ...base, ok: false, detail: 'delivered grant has no tx_ref — repair this row' }
    }
    const tx = await fetchTx(grant.tx_ref)
    if (tx === null) {
      return { ...base, ok: false, detail: 'tx not found on-chain at the required commitment' }
    }
    if (tx.status !== 'success') {
      return { ...base, ok: false, detail: 'tx reverted on-chain' }
    }

    const funder = expectedFunder(grant, chainFunder)
    if (!sameAddress(tx.from, funder)) {
      return { ...base, ok: false, detail: `funded by ${tx.from}, not the recorded seed wallet ${funder}` }
    }

    // A CONTRACT CREATION has no `to`. It cannot be a seed, and treating a null
    // `to` as a match would let one pass unnoticed.
    if (tx.to === null) {
      return { ...base, ok: false, detail: 'tx has no recipient — not a native transfer' }
    }

    const expected = BigInt(grant.amount_raw)
    if (tx.value !== expected) {
      return { ...base, ok: false, detail: `transferred ${tx.value} wei, grant records ${expected}` }
    }

    // The wallet the grant RECORDED is the one that should have been paid.
    // Null only for grants written before #53c-1 added the column; those are
    // reported as verified with the gap named rather than silently passed.
    if (grant.wallet_address === null) {
      return {
        ...base,
        ok: true,
        detail: `${tx.value} wei → ${tx.to} (grant predates wallet_address — destination unchecked)`,
      }
    }
    if (!sameAddress(tx.to, grant.wallet_address)) {
      return {
        ...base,
        ok: false,
        detail: `paid ${tx.to}, but the grant records ${grant.wallet_address}`,
      }
    }

    return { ...base, ok: true, detail: `${tx.value} wei → ${tx.to}` }
  } catch (err) {
    return { ...base, ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}
