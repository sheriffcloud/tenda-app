/**
 * The one way a route turns an escrow row into an unsigned transaction.
 *
 * Every `/v1/escrows/:id/*` transition repeated the same three steps — check the
 * chain is configured, get its adapter, call `buildTx` — and open_issues #89 adds
 * a fourth that must never be skipped: resolve WHICH contract holds this
 * escrow's funds. A step repeated in twelve places is a step that will be missing
 * from the thirteenth, and the cost of missing it here is a transaction built
 * against a contract that has never heard of the escrow, so it reverts and the
 * money stays unreachable.
 *
 * Routes therefore call this instead of `chains.get(...).buildTx(...)`, and a new
 * transition gets the guard by construction rather than by review.
 */

import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { resolveEscrowContract, type ContractRegistry, type EscrowContractRef } from '@server/chains/contracts'
import type { BuildTxAction, ChainRegistry, UnsignedTx } from '@server/chains/types'

export interface BuildEscrowTxDeps {
  chains: ChainRegistry
  contracts: ContractRegistry
}

/**
 * Build against the contract that holds `escrow`'s funds.
 *
 * `build` is the action WITHOUT a contract — supplying one is this function's
 * job, and the type makes passing a hand-picked contract impossible rather than
 * merely discouraged.
 */
export async function buildEscrowTx(
  deps: BuildEscrowTxDeps,
  escrow: EscrowContractRef,
  build: BuildTxAction,
): Promise<UnsignedTx> {
  // A chain can be deconfigured after an escrow was created (env removed,
  // rollback). Surface it as a clean 503 rather than the registry's raw throw.
  if (!deps.chains.has(escrow.chain_id)) {
    throw new AppError(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      `chain '${escrow.chain_id}' is not currently available`,
    )
  }
  const contract = resolveEscrowContract(escrow, deps.contracts)
  return deps.chains.get(escrow.chain_id).buildTx({ ...build, contract })
}
