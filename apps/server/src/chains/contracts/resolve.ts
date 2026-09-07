/**
 * Which contract does THIS escrow's money live in?
 *
 * Every transition must be built against the contract that actually holds the
 * funds, not against whichever contract is current — that mismatch is
 * open_issues #89, and it strands an escrow permanently: the transaction is
 * built for a contract that has never heard of it, so it reverts, and no
 * sequence of retries can ever move the money.
 */

import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { normalizeContractAddress } from './normalize'
import type { ContractRegistry } from './registry'

/** The escrow fields this resolution needs. `EscrowRow` satisfies it structurally. */
export interface EscrowContractRef {
  id: string
  chain_id: string
  escrow_contract: string | null
}

/**
 * Resolve the contract to transact with, or refuse.
 *
 * A NULL stamp means UNKNOWN, never "current". Two cases, and the difference
 * is the whole safety property:
 *
 *   - the chain has only ever run ONE contract → there is nothing to be wrong
 *     about, so an unstamped row resolves to it. This is what lets escrows
 *     created before the column existed keep working without a backfill.
 *   - the chain has run more than one → an unstamped row is genuinely
 *     ambiguous, and guessing "current" is exactly the bug this column exists
 *     to prevent. Refuse instead.
 *
 * So the fallback disables ITSELF at the moment it stops being safe, rather
 * than depending on anyone remembering to remove it.
 *
 * ONE deployment ordering breaks that guarantee, and no code here can detect it:
 * swapping a chain's contract in the SAME release that first ships pinning. The
 * seed would then record only the NEW address, the chain would show exactly one
 * known contract, and pre-existing unstamped escrows would resolve to it while
 * their funds sat in the old one. Ship pinning first, let one seed record the
 * current contract, and the swap afterwards makes the set ambiguous — which is
 * what turns the guess into a refusal. Recorded in the redeploy runbook
 * (`docs/production_setup_guide.md` § Replacing an escrow contract), because it
 * is a sequencing rule rather than a property the resolver can enforce.
 */
export function resolveEscrowContract(
  escrow: EscrowContractRef,
  registry: ContractRegistry,
): string {
  const contracts = registry.get(escrow.chain_id)
  if (contracts === undefined) {
    throw new AppError(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      `chain '${escrow.chain_id}' is not currently available`,
    )
  }

  if (escrow.escrow_contract === null) {
    if (contracts.known.size === 1) return contracts.current
    throw new AppError(
      409,
      ErrorCode.ESCROW_MISMATCH,
      `escrow ${escrow.id} records no escrow contract, and ${escrow.chain_id} has run ` +
        `${contracts.known.size} of them (${[...contracts.known].join(', ')}) — refusing to ` +
        'guess which one holds its funds',
    )
  }

  const stamped = normalizeContractAddress(contracts.namespace, escrow.escrow_contract)
  if (!contracts.known.has(stamped)) {
    throw new AppError(
      409,
      ErrorCode.ESCROW_MISMATCH,
      `escrow ${escrow.id} records escrow contract ${stamped}, which is not a known contract ` +
        `for ${escrow.chain_id} (${[...contracts.known].join(', ')})`,
    )
  }
  return stamped
}
