/**
 * Settlement + pre-acceptance unwind encoding: approve / claim_stalled /
 * reclaim_abandoned, and cancel / refund_expired.
 *
 * Split out of the action switch (300-line ceiling) along the same seam the
 * Anchor program uses — these are its `escrow_state` settlement handlers and
 * its `escrow_create` unwind handlers, which fork SOL vs SPL on decoded
 * on-chain state rather than on anything the caller supplies.
 */

import { SystemProgram, type PublicKey, type TransactionInstruction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { platformPda, tokenVaultPda, vaultPda } from '@server/chains/solana/pdas'
import type { BuildTxArgs } from '@server/chains/types'
import {
  ataProvisioningIx,
  counterpartyOrThrow,
  fetchEscrow,
  fetchPlatformState,
  isNativeSol,
  type SolanaBuilderDeps,
} from '@server/chains/solana/builder-internals'

/** The actions this module encodes. */
export type SettleAction = Extract<
  BuildTxArgs,
  { action: 'approveCompletion' | 'claimStalledPayment' | 'reclaimAbandoned' | 'cancelEscrow' | 'refundExpired' }
>

export async function buildSettleInstruction(
  deps: SolanaBuilderDeps,
  args: SettleAction,
  wallet: PublicKey,
): Promise<TransactionInstruction[]> {
  switch (args.action) {
case 'approveCompletion':
case 'claimStalledPayment':
case 'reclaimAbandoned': {
  const { escrowAddr, idBytes, escrow } = await fetchEscrow(deps, args.payload.escrow_id)
  const platform = await fetchPlatformState(deps)
  const counterparty = counterpartyOrThrow(escrow)
  if (isNativeSol(escrow)) {
    const accounts = {
      escrow: escrowAddr,
      platformState: platformPda(),
      vault: vaultPda(idBytes),
      creator: escrow.creator,
      counterparty,
      treasury: platform.treasury,
      signer: wallet,
      systemProgram: SystemProgram.programId,
    }
    switch (args.action) {
      case 'approveCompletion':
        return [await deps.program.methods.approveCompletionSol().accountsPartial(accounts).instruction()]
      case 'claimStalledPayment':
        return [await deps.program.methods.claimStalledPaymentSol().accountsPartial(accounts).instruction()]
      case 'reclaimAbandoned':
        return [await deps.program.methods.reclaimAbandonedSol().accountsPartial(accounts).instruction()]
    }
  }
  const mint = escrow.asset
  if (args.action === 'reclaimAbandoned') {
    // `ReclaimSpl` refunds only the creator, so it declares just the vault
    // and the creator's ATA, no counterparty/treasury token accounts. The
    // creator's ATA already exists (they deposited from it at create), so
    // this path provisions nothing.
    return [
      await deps.program.methods
        .reclaimAbandonedSpl()
        .accountsPartial({
          escrow: escrowAddr,
          platformState: platformPda(),
          vaultTokenAccount: tokenVaultPda(idBytes),
          creator: escrow.creator,
          creatorTokenAccount: getAssociatedTokenAddressSync(mint, escrow.creator),
          signer: wallet,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    ]
  }
  const accounts = {
    escrow: escrowAddr,
    platformState: platformPda(),
    vaultTokenAccount: tokenVaultPda(idBytes),
    creator: escrow.creator,
    counterparty,
    treasury: platform.treasury,
    creatorTokenAccount: getAssociatedTokenAddressSync(mint, escrow.creator),
    counterpartyTokenAccount: getAssociatedTokenAddressSync(mint, counterparty),
    treasuryTokenAccount: getAssociatedTokenAddressSync(mint, platform.treasury),
    signer: wallet,
    tokenProgram: TOKEN_PROGRAM_ID,
  }
  // `SettleSpl` deserializes creator/counterparty/treasury token accounts
  // regardless of which the handler pays, so provision all three.
  const preIx = ataProvisioningIx(wallet, [escrow.creator, counterparty, platform.treasury], mint)
  switch (args.action) {
    case 'approveCompletion':
      return [...preIx, await deps.program.methods.approveCompletionSpl().accountsPartial(accounts).instruction()]
    case 'claimStalledPayment':
      return [...preIx, await deps.program.methods.claimStalledPaymentSpl().accountsPartial(accounts).instruction()]
  }
  // Exhaustive switch above, unreachable, but satisfies control-flow analysis.
  throw new AppError(500, ErrorCode.INTERNAL_ERROR, `unhandled settle action`)
}

case 'cancelEscrow':
case 'refundExpired': {
  const { escrowAddr, idBytes, escrow } = await fetchEscrow(deps, args.payload.escrow_id)
  if (isNativeSol(escrow)) {
    const accounts = {
      escrow: escrowAddr,
      vault: vaultPda(idBytes),
      creator: wallet,
      systemProgram: SystemProgram.programId,
    }
    return [
      args.action === 'cancelEscrow'
        ? await deps.program.methods.cancelEscrowSol().accountsPartial(accounts).instruction()
        : await deps.program.methods.refundExpiredSol().accountsPartial(accounts).instruction(),
    ]
  }
  const accounts = {
    escrow: escrowAddr,
    vaultTokenAccount: tokenVaultPda(idBytes),
    creatorTokenAccount: getAssociatedTokenAddressSync(escrow.asset, wallet),
    creator: wallet,
    tokenProgram: TOKEN_PROGRAM_ID,
  }
  return [
    args.action === 'cancelEscrow'
      ? await deps.program.methods.cancelEscrowSpl().accountsPartial(accounts).instruction()
      : await deps.program.methods.refundExpiredSpl().accountsPartial(accounts).instruction(),
  ]
}
  }
}
