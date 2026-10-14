/**
 * The Solana arm of the gas-seed audit.
 *
 * Unchanged in substance by #53b — only moved, so an EVM arm could sit beside
 * it rather than be bolted into it. A native SOL transfer is an INSTRUCTION
 * inside a transaction, so this decodes an instruction list; its EVM twin reads
 * three fields off the transaction itself. That asymmetry belongs to the
 * chains, not to the audit.
 */

import type { ParsedInstruction, PartiallyDecodedInstruction } from '@solana/web3.js'
import type { CheckResult, GrantRow } from './shared'
import { expectedFunder, unfinishedResult } from './shared'

// ---------- typed narrowing over web3.js' `any`-typed parsed payload --------

/** Narrow an unknown value to a plain record without reaching for `any`. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

interface SystemTransfer {
  source: string
  destination: string
  lamports: bigint
}

/** Minimal decoded view of a parsed tx — the only surface `checkGrant` needs. */
export interface ParsedTxView {
  /** Runtime error, or null on success (mirrors `meta.err`). */
  err: unknown
  instructions: ReadonlyArray<ParsedInstruction | PartiallyDecodedInstruction>
}

/** Fetch a parsed tx by signature; null = unknown at the required commitment. */
export type FetchParsedTx = (tx_ref: string) => Promise<ParsedTxView | null>

/**
 * Extract a native SOL transfer from a parsed instruction, or undefined if the
 * instruction isn't a `system`/`transfer`. `ix.parsed` is typed `any` upstream;
 * we read it as `unknown` and validate every field at runtime.
 */
export function parseSystemTransfer(
  ix: ParsedInstruction | PartiallyDecodedInstruction,
): SystemTransfer | undefined {
  if (!('parsed' in ix) || ix.program !== 'system') return undefined
  const parsed = asRecord(ix.parsed)
  if (parsed === undefined || parsed.type !== 'transfer') return undefined
  const info = asRecord(parsed.info)
  if (info === undefined) return undefined
  const { source, destination, lamports } = info
  if (typeof source !== 'string' || typeof destination !== 'string') return undefined
  if (typeof lamports !== 'number' && typeof lamports !== 'string') return undefined
  return { source, destination, lamports: BigInt(lamports) }
}

/** Verify one grant against the chain; never throws (errors become a failing result). */
export async function checkGrant(
  fetchTx: FetchParsedTx,
  grant: GrantRow,
  chainFunder: string,
  walletsFor: (user_id: string) => Promise<Set<string>>,
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
    if (tx === null) return { ...base, ok: false, detail: 'tx not found on-chain at the required commitment' }
    if (tx.err != null) {
      return { ...base, ok: false, detail: `tx failed on-chain: ${JSON.stringify(tx.err)}` }
    }

    const transfer = tx.instructions
      .map(parseSystemTransfer)
      .find((t): t is SystemTransfer => t !== undefined)
    if (transfer === undefined) return { ...base, ok: false, detail: 'no SystemProgram transfer in tx' }

    // The grant's OWN funder where it has one (#53c-1). Checking history
    // against the CURRENTLY configured key flagged every grant an older key had
    // paid — an alarm that fires on a correct rotation.
    const funder = expectedFunder(grant, chainFunder)
    if (transfer.source !== funder) {
      return { ...base, ok: false, detail: `funded by ${transfer.source}, not the recorded seed wallet ${funder}` }
    }
    const expected = BigInt(grant.amount_raw)
    if (transfer.lamports !== expected) {
      return { ...base, ok: false, detail: `transferred ${transfer.lamports} lamports, grant records ${expected}` }
    }

    // Destination should be a wallet the grantee controls. Rotation (old wallet
    // removed) can legitimately empty this set, so a miss is reported, not failed.
    const wallets = await walletsFor(grant.user_id)
    const note =
      wallets.has(transfer.destination)
        ? '→ current wallet'
        : wallets.size === 0
          ? '→ user has no current Solana wallet (rotated)'
          : `⚠ destination not among user's current wallets (${transfer.destination})`
    return { ...base, ok: true, detail: `${transfer.lamports} lamports → ${transfer.destination} ${note}` }
  } catch (err) {
    return { ...base, ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}
