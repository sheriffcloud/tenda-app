/**
 * Builds the unsigned on-chain "resolve dispute" transaction. Shared by the
 * party-facing POST /v1/escrows/:id/resolve and the admin resolution
 * execute-build, so the two callers (different auth models) never duplicate
 * the raiser lookup + adapter dispatch.
 *
 * The on-chain resolve instruction routes the dispute bond by the RAISER's
 * identity, recovered here from the dispute record (one row per escrow).
 */
import { eq } from 'drizzle-orm'
import { disputes } from '@tenda/shared/db/schema/governance'
import { ErrorCode, type ResolutionWinner } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { AppDatabase } from '@server/plugins/db'
import type { ChainRegistry, UnsignedTx } from '@server/chains/types'
import {
  resolveEscrowContract,
  type ContractRegistry,
  type EscrowContractRef,
} from '@server/chains/contracts'

export interface BuildResolveTxDeps {
  db: AppDatabase
  chains: ChainRegistry
  contracts: ContractRegistry
}

export interface BuildResolveTxArgs {
  /**
   * The escrow being resolved, carrying its pinned contract.
   *
   * The whole row reference rather than a bare `chain_id`: a dispute is exactly
   * the case where an escrow outlives a redeploy — it is non-terminal for as
   * long as it takes to adjudicate — so the resolve transaction must be built
   * against the contract actually holding the funds and the bond.
   */
  escrow: EscrowContractRef
  winner: ResolutionWinner
  /** The signing admin's user id — attribution only, NOT the signer wallet. */
  signer_user_id: string
}

export async function buildResolveTx(
  deps: BuildResolveTxDeps,
  args: BuildResolveTxArgs,
): Promise<UnsignedTx> {
  const [dispute] = await deps.db
    .select({ raised_by: disputes.raised_by })
    .from(disputes)
    .where(eq(disputes.escrow_id, args.escrow.id))
    .limit(1)
  if (dispute === undefined) {
    throw new AppError(
      409,
      ErrorCode.ESCROW_WRONG_STATUS,
      `escrow ${args.escrow.id} has no dispute record to resolve`,
    )
  }

  const adapter = deps.chains.get(args.escrow.chain_id)

  // The resolve tx is authorised by the chain's dispute-resolution key, whose
  // public address rides the adapter (from its secret). It is the signer
  // (Solana bakes it in as fee-payer/`disputeAdmin`; EVM signs from it) —
  // never the calling admin's personal wallet, which may not exist for this
  // chain's namespace.
  const signer_address = adapter.disputeAuthority
  if (signer_address === undefined) {
    throw new AppError(
      409,
      ErrorCode.CHAIN_NOT_CONFIGURED,
      `no dispute-resolution authority configured for ${args.escrow.chain_id}`,
    )
  }

  return adapter.buildTx({
    action: 'resolveDispute',
    user_id: args.signer_user_id,
    signer_address,
    contract: resolveEscrowContract(args.escrow, deps.contracts),
    payload: { escrow_id: args.escrow.id, winner: args.winner, raiser_user_id: dispute.raised_by },
  })
}
