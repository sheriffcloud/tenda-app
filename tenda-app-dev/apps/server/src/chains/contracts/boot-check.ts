/**
 * Boot gate: does any LIVE escrow name a contract the registry no longer knows?
 *
 * The registry is built from config + `chain_contracts`. If that history is
 * lost — a database restored from a snapshot older than a redeploy, a truncated
 * table — the set silently narrows, and the narrowing is invisible: escrows
 * whose funds sit in the forgotten contract start returning 409, and the EVM
 * listener quietly stops watching it. Both fail SAFE (nothing is ever sent to a
 * wrong address) but neither fails LOUD, and a stranded escrow that nobody is
 * told about is precisely the failure open_issues #89 exists to end.
 *
 * Scoped to non-terminal escrows on purpose. A settled escrow naming a
 * forgotten contract is a curiosity, not a problem — its money already moved —
 * and letting one block startup would turn old history into a crash-loop. Only
 * escrows that still need to transact can hold a deploy hostage, which is the
 * same bargain `assertChainRegistryInSync` strikes.
 */

import { and, eq, isNotNull, notInArray } from 'drizzle-orm'
import { escrows } from '@tenda/shared/db/schema'
import { TERMINAL_ESCROW_STATUSES } from '@tenda/shared/db/schema/escrow/enums'
import type { AppDatabase } from '@server/plugins/db'
import type { ContractRegistry } from './registry'

/** Examples to name in the failure. Enough to diagnose, bounded so the probe stays cheap. */
const UNKNOWN_CONTRACT_SAMPLE_LIMIT = 5

export interface UnknownContractEscrow {
  escrow_id: string
  chain_id: string
  escrow_contract: string
}

/**
 * Live escrows whose stamped contract is outside the known set.
 *
 * An index-friendly existence probe (`escrows_chain_contract_idx`), not a
 * `DISTINCT` over the table: it answers "is anything wrong" for a bounded cost
 * that does not grow with escrow history.
 */
export async function findUnknownContractEscrows(
  db: AppDatabase,
  registry: ContractRegistry,
  limit: number = UNKNOWN_CONTRACT_SAMPLE_LIMIT,
): Promise<UnknownContractEscrow[]> {
  const found: UnknownContractEscrow[] = []

  for (const { chain_id, known } of registry.list()) {
    const rows = await db
      .select({ id: escrows.id, escrow_contract: escrows.escrow_contract })
      .from(escrows)
      .where(
        and(
          eq(escrows.chain_id, chain_id),
          isNotNull(escrows.escrow_contract),
          notInArray(escrows.escrow_contract, [...known]),
          notInArray(escrows.status, [...TERMINAL_ESCROW_STATUSES]),
        ),
      )
      .limit(limit)

    for (const row of rows) {
      // Narrowing only: `isNotNull` above already excludes null, but the column
      // type cannot express that, and a cast would be a lie the compiler can't
      // check.
      if (row.escrow_contract === null) continue
      found.push({ escrow_id: row.id, chain_id, escrow_contract: row.escrow_contract })
    }
  }

  return found
}

/**
 * Throw when live escrows reference forgotten contracts.
 *
 * Actionable by construction: the fix is to restore the `chain_contracts` rows
 * (re-run `pnpm db:seed` if the contract is still the configured one, otherwise
 * re-insert the superseded address), and the message names the addresses to
 * restore rather than leaving them to be reverse-engineered from a 409.
 */
export async function assertEscrowContractsKnown(
  db: AppDatabase,
  registry: ContractRegistry,
): Promise<void> {
  const unknown = await findUnknownContractEscrows(db, registry)
  if (unknown.length === 0) return

  const lines = unknown.map(
    (u) => `  escrow ${u.escrow_id} on ${u.chain_id} → ${u.escrow_contract}`,
  )
  throw new Error(
    'live escrows reference escrow contracts this deployment does not know:\n' +
      lines.join('\n') +
      '\n  Their funds are held by those contracts, so refusing to start rather than\n' +
      '  serving 409s on every transition. Restore the missing `chain_contracts` rows\n' +
      '  (`pnpm db:seed` re-records the CURRENT contract; a superseded one must be\n' +
      '  re-inserted) and start again.',
  )
}
