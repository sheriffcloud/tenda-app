/**
 * One-time cleanup logic for case-duplicate wallet rows, the residue of the
 * pre-fix era when `(chain_ns, address)` dedup was case-SENSITIVE, so the same
 * EVM wallet could land twice (e.g. checksummed + lowercased). The live code now
 * folds case on every read/compare AND blocks new case-variant links, so this is
 * a backfill for existing rows only. Pure (no DB) so the keeper choice is
 * unit-tested; `scripts/dedupe-wallets.ts` performs the deletes.
 */
import { normalizeWalletAddress } from './wallet-address'
import type { ChainNamespace } from '@tenda/shared/db/schema'

export interface WalletRow {
  user_id: string
  chain_ns: ChainNamespace
  address: string
  is_primary: boolean
  verified_at: Date
}

/** Group key that collapses case-variants of the SAME wallet for one user. */
export function walletDedupeKey(w: Pick<WalletRow, 'user_id' | 'chain_ns' | 'address'>): string {
  return `${w.user_id}|${w.chain_ns}|${normalizeWalletAddress(w.chain_ns, w.address)}`
}

/**
 * Of rows that are the SAME wallet, choose the ONE to keep: the primary if any
 * (so the one-primary-per-user invariant survives), else the earliest-verified,
 * with address as a final deterministic tiebreak. Never mutates its input.
 */
export function chooseWalletKeeper(group: readonly WalletRow[]): WalletRow {
  return [...group].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    const dt = a.verified_at.getTime() - b.verified_at.getTime()
    if (dt !== 0) return dt
    return a.address < b.address ? -1 : a.address > b.address ? 1 : 0
  })[0]
}

/**
 * Given a set of wallet rows, return exactly the rows to DELETE, every
 * case-duplicate beyond the chosen keeper in each group. Rows with no duplicate
 * are never returned, and a primary row is only ever deleted if it is NOT the
 * keeper (which `chooseWalletKeeper` never does), so the primary marker is
 * always preserved. Pure: the caller performs the deletes.
 */
export function planWalletDedupe(rows: readonly WalletRow[]): WalletRow[] {
  const groups = new Map<string, WalletRow[]>()
  for (const r of rows) {
    const key = walletDedupeKey(r)
    const existing = groups.get(key)
    if (existing !== undefined) existing.push(r)
    else groups.set(key, [r])
  }

  const toDelete: WalletRow[] = []
  for (const group of groups.values()) {
    if (group.length <= 1) continue
    const keeper = chooseWalletKeeper(group)
    for (const row of group) if (row !== keeper) toDelete.push(row)
  }
  return toDelete
}
