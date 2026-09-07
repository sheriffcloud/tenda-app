/**
 * Per-action instruction encoding for the Solana escrow program. One switch
 * over `BuildTxArgs.action`; asset forking (SOL vs SPL variants) is derived
 * from decoded on-chain state. No network I/O outside the injected RPC (via the
 * shared lookups); the Anchor `Program` is used purely for encoding.
 */

import { BN } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, type TransactionInstruction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { uuidToBytes } from '@server/chains/ids'
import { escrowPda, platformPda, tokenVaultPda, vaultPda } from '@server/chains/solana/pdas'
import type { BuildTxArgs } from '@server/chains/types'
import { AppError } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'
import {
  decodeProofHash,
  toBn,
  type FetchedEscrow,
  type SolanaBuilderDeps,
} from '@server/chains/solana/builder-internals'
import { buildSettleInstruction } from './settle'
import { buildDisputeInstruction } from './dispute'

/**
 * builders.ts fetches the escrow account ONCE (signer resolution needs it
 * first) and threads it here; only createEscrow legitimately has none. A null
 * on any other path is a wiring bug, not an on-chain condition — fetchEscrow
 * itself 404s a missing account before this can run.
 */
function requireFetched(fetched: FetchedEscrow | null): FetchedEscrow {
  if (fetched === null) {
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, 'escrow account not fetched for a transition build')
  }
  return fetched
}

/**
 * Encode the instruction(s) for one escrow action. Returns an array because
 * SPL settlement/dispute-resolution paths prepend idempotent ATA-provisioning
 * instructions (see `ataProvisioningIx`); every other path returns a single
 * instruction. The action's own instruction is always last.
 */
export async function buildInstruction(
  deps: SolanaBuilderDeps,
  args: BuildTxArgs,
  wallet: PublicKey,
  /** The escrow account builders.ts fetched; null only for createEscrow. */
  fetched: FetchedEscrow | null,
): Promise<TransactionInstruction[]> {
  switch (args.action) {
    case 'createEscrow': {
      const p = args.payload
      const idBytes = uuidToBytes(p.escrow_id)
      const asset = await deps.resolveAsset(p.asset)
      const ixArgs = {
        escrowId: Array.from(idBytes),
        kind: p.kind === 'gig' ? { gig: {} } : { exchange: {} },
        amount: toBn(p.amount_raw, 'amount_raw'),
        assignedCounterparty:
          p.assigned_counterparty_user_id !== undefined
            ? new PublicKey(await deps.resolveWalletAddress(p.assigned_counterparty_user_id))
            : null,
        acceptDeadline: new BN(p.accept_deadline_unix),
        completionDurationSeconds: new BN(p.completion_duration_seconds),
        disputeBond: toBn(p.dispute_bond_raw, 'dispute_bond_raw'),
        isSeeker: p.is_seeker,
        requiresApproval: p.requires_approval,
        unassignWindowSeconds: new BN(p.unassign_window_seconds),
      }
      if (asset.token_address === null) {
        return [
          await deps.program.methods
            .createEscrowSol(ixArgs)
            .accountsPartial({
              escrow: escrowPda(idBytes),
              vault: vaultPda(idBytes),
              creator: wallet,
              systemProgram: SystemProgram.programId,
            })
            .instruction(),
        ]
      }
      const mint = new PublicKey(asset.token_address)
      return [
        await deps.program.methods
          .createEscrowSpl(ixArgs)
          .accountsPartial({
            escrow: escrowPda(idBytes),
            vaultTokenAccount: tokenVaultPda(idBytes),
            mint,
            creatorTokenAccount: getAssociatedTokenAddressSync(mint, wallet),
            creator: wallet,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction(),
      ]
    }

    case 'acceptEscrow':
    case 'declineAssignedEscrow':
    case 'unassign': {
      const { escrowAddr } = requireFetched(fetched)
      const method =
        args.action === 'acceptEscrow'
          ? deps.program.methods.acceptEscrow()
          : args.action === 'declineAssignedEscrow'
            ? deps.program.methods.declineAssignedEscrow()
            : deps.program.methods.unassign()
      return [
        await method
          .accountsPartial({ escrow: escrowAddr, platformState: platformPda(), signer: wallet })
          .instruction(),
      ]
    }

    case 'assignAccept': {
      const { escrowAddr } = requireFetched(fetched)
      // The worker signs nothing here — they are an instruction ARGUMENT, not
      // an account, which is the whole point of approval mode. The
      // application's chosen wallet wins when the route validated one; the
      // primary-first resolver only covers pre-choice applications.
      const worker = new PublicKey(
        args.payload.worker_address ??
          (await deps.resolveWalletAddress(args.payload.worker_user_id)),
      )
      return [
        await deps.program.methods
          .assignAccept(worker)
          .accountsPartial({ escrow: escrowAddr, platformState: platformPda(), signer: wallet })
          .instruction(),
      ]
    }

    case 'submitProof': {
      const { escrowAddr } = requireFetched(fetched)
      return [
        await deps.program.methods
          .submitProof(decodeProofHash(args.payload.proof_hash))
          .accountsPartial({ escrow: escrowAddr, platformState: platformPda(), signer: wallet })
          .instruction(),
      ]
    }

    case 'approveCompletion':
    case 'claimStalledPayment':
    case 'reclaimAbandoned':
    case 'cancelEscrow':
    case 'refundExpired':
      return buildSettleInstruction(deps, args, wallet, requireFetched(fetched))

    case 'disputeEscrow':
    case 'resolveDispute':
      return buildDisputeInstruction(deps, args, wallet, requireFetched(fetched))
  }
}
