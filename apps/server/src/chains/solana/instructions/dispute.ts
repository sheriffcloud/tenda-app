/**
 * Dispute encoding: dispute_escrow (bond deposit) and resolve_dispute (admin
 * settlement). Split out of the action switch (300-line ceiling) along the
 * Anchor program's own `dispute` module seam.
 */

import { PublicKey, SystemProgram, type TransactionInstruction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { platformPda, tokenVaultPda, vaultPda } from '@server/chains/solana/pdas'
import type { BuildTxArgs } from '@server/chains/types'
import {
  ataProvisioningIx,
  counterpartyOrThrow,
  fetchEscrow,
  fetchPlatformState,
  isNativeSol,
  toBn,
  WINNER_ARG,
  type SolanaBuilderDeps,
} from '@server/chains/solana/builder-internals'

/** The actions this module encodes. */
export type DisputeAction = Extract<BuildTxArgs, { action: 'disputeEscrow' | 'resolveDispute' }>

export async function buildDisputeInstruction(
  deps: SolanaBuilderDeps,
  args: DisputeAction,
  wallet: PublicKey,
): Promise<TransactionInstruction[]> {
  switch (args.action) {
case 'disputeEscrow': {
  const { escrowAddr, idBytes, escrow } = await fetchEscrow(deps, args.payload.escrow_id)
  const bond = toBn(args.payload.bond_raw, 'bond_raw')
  if (isNativeSol(escrow)) {
    return [
      await deps.program.methods
        .disputeEscrowSol(bond)
        .accountsPartial({
          escrow: escrowAddr,
          vault: vaultPda(idBytes),
          raiser: wallet,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ]
  }
  return [
    await deps.program.methods
      .disputeEscrowSpl(bond)
      .accountsPartial({
        escrow: escrowAddr,
        vaultTokenAccount: tokenVaultPda(idBytes),
        raiserTokenAccount: getAssociatedTokenAddressSync(escrow.asset, wallet),
        raiser: wallet,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction(),
  ]
}

case 'resolveDispute': {
  const { escrowAddr, idBytes, escrow } = await fetchEscrow(deps, args.payload.escrow_id)
  const platform = await fetchPlatformState(deps)
  const counterparty = counterpartyOrThrow(escrow)
  const winner = WINNER_ARG[args.payload.winner]
  const raiser = new PublicKey(await deps.resolveWalletAddress(args.payload.raiser_user_id))
  if (isNativeSol(escrow)) {
    return [
      await deps.program.methods
        .resolveDisputeSol(winner, raiser)
        .accountsPartial({
          escrow: escrowAddr,
          platformState: platformPda(),
          vault: vaultPda(idBytes),
          creator: escrow.creator,
          counterparty,
          treasury: platform.treasury,
          disputeAdmin: wallet,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ]
  }
  const mint = escrow.asset
  // `ResolveSpl` deserializes all three token accounts for every winner
  // outcome (a Split pays treasury nothing yet still loads its ATA), so
  // provision creator/counterparty/treasury unconditionally.
  const preIx = ataProvisioningIx(wallet, [escrow.creator, counterparty, platform.treasury], mint)
  return [
    ...preIx,
    await deps.program.methods
      .resolveDisputeSpl(winner, raiser)
      .accountsPartial({
        escrow: escrowAddr,
        platformState: platformPda(),
        vaultTokenAccount: tokenVaultPda(idBytes),
        creator: escrow.creator,
        counterparty,
        treasury: platform.treasury,
        creatorTokenAccount: getAssociatedTokenAddressSync(mint, escrow.creator),
        counterpartyTokenAccount: getAssociatedTokenAddressSync(mint, counterparty),
        treasuryTokenAccount: getAssociatedTokenAddressSync(mint, platform.treasury),
        disputeAdmin: wallet,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction(),
  ]
}
  }
}
