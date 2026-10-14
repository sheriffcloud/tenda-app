/**
 * What every namespace's gas-seed audit needs, whatever chain it verifies.
 *
 * The script was Solana-only and its error text hardcoded `CHAIN_SOLANA_*`
 * (#53b item 3). Splitting the namespace-agnostic half out is what lets an EVM
 * arm exist beside the Solana one instead of being bolted into it — and keeps
 * each file inside the line budget.
 */

import type { GasGrantStatus } from '@tenda/shared'

/** One grant row, as the audit reads it. */
export interface GrantRow {
  user_id: string
  chain_id: string
  amount_raw: string
  /** Where the grant stopped. #58 replaced the `pending:` tx_ref prefix with this. */
  status: GasGrantStatus
  /** NULL while nothing has been signed — see `unfinishedResult`. */
  tx_ref: string | null
  /**
   * Which hot wallet PAID this grant, recorded per grant since #53c-1.
   *
   * The audit checks history against THIS rather than against whatever key is
   * configured now — before the column existed, rotating a seed key
   * retroactively flagged every grant the old wallet had paid as "funded by the
   * wrong wallet", an alarm that fires on a correct operation. Null for grants
   * written before the column, which fall back to the chain's current funder.
   */
  funder_address: string | null
  /** Which wallet was PAID. Null for pre-#53c-1 grants; the audit then skips the check. */
  wallet_address: string | null
  granted_at: Date
}

export interface CheckResult {
  user_id: string
  chain_id: string
  tx_ref: string | null
  ok: boolean
  detail: string
}

export function parseUserFilter(argv: readonly string[]): string | undefined {
  const i = argv.indexOf('--user')
  if (i === -1) return undefined
  const value = argv[i + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error('--user requires a user id argument')
  }
  return value
}

/**
 * The one check every namespace shares: a grant that is not `delivered` has
 * nothing on chain to verify, so it is reported rather than looked up.
 *
 * THE THREE UNFINISHED STATES ARE NOT EQUALLY URGENT, and the detail text is
 * what tells them apart — before #58 they were one indistinguishable `pending:`
 * string, which is precisely why a stuck grant looked like a fresh one:
 *
 *   claimed    — nothing was ever signed. Harmless in itself: no money left, and
 *                the user can be released to claim again.
 *   submitted  — a transfer is out there and the confirm job is still asking.
 *                Usually transient; only interesting if it stays.
 *   unresolved — the confirm job GAVE UP. This is the row that needs a person:
 *                the money may or may not have moved, and only a human looking
 *                at the chain can decide whether to stamp it or release it.
 *
 * Returned as a RESULT rather than thrown: they are findings the operator needs
 * listed beside the others, not errors that stop the run.
 */
export function unfinishedResult(grant: GrantRow): CheckResult | null {
  if (grant.status === 'delivered') return null
  const base = { user_id: grant.user_id, chain_id: grant.chain_id, tx_ref: grant.tx_ref, ok: false }
  if (grant.status === 'claimed') {
    return { ...base, detail: 'slot claimed but nothing was ever signed — safe to release' }
  }
  if (grant.status === 'submitted') {
    return { ...base, detail: 'broadcast, awaiting confirmation — check again before acting' }
  }
  return {
    ...base,
    detail: 'UNRESOLVED — confirmation gave up; settle this one by hand against the chain',
  }
}

/** The funder this grant should have been paid by: its own, else the chain's current one. */
export function expectedFunder(grant: GrantRow, chainFunder: string): string {
  return grant.funder_address ?? chainFunder
}
