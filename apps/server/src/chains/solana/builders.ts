/**
 * Unsigned-transaction orchestrator for every escrow action: resolve the
 * signer wallet, encode the action's instruction(s) (instructions.ts), SPL
 * settlement/resolve paths prepend idempotent ATA-provisioning instructions,
 * wrap them in a v0 `VersionedTransaction` against a fresh blockhash, and
 * serialize. Asset forking + on-chain lookups live in instructions.ts /
 * builder-internals.ts; the only network I/O here is the injected `SolanaRpc`.
 */

import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { BuildTxArgs, UnsignedTx } from '@server/chains/types'
import { buildInstruction } from '@server/chains/solana/instructions'
import { PROGRAM_ID } from '@server/chains/solana/pdas'
import type { SolanaBuilderDeps } from '@server/chains/solana/builder-internals'

export type { SolanaBuilderDeps }

export function createSolanaBuilders(deps: SolanaBuilderDeps) {
  async function buildTx(args: BuildTxArgs): Promise<UnsignedTx> {
    // Every instruction and PDA below derives from the compiled-in PROGRAM_ID,
    // so a caller asking for a DIFFERENT program cannot be served — and must not
    // be served silently, which is what ignoring the field would do. Unreachable
    // while the policy holds (Solana upgrades in place, keeping its id, so a
    // chain's known set is the single IDL address), and that is exactly why it
    // is worth failing loudly if the policy is ever broken.
    if (args.contract !== undefined && args.contract !== PROGRAM_ID.toBase58()) {
      throw new AppError(
        409,
        ErrorCode.ESCROW_MISMATCH,
        `escrow is held by program ${args.contract}, but this deployment runs ` +
          `${PROGRAM_ID.toBase58()} — a Solana program replacement needs a rebuilt IDL, ` +
          'not a runtime switch',
      )
    }

    // resolveDispute is signed by the chain's configured dispute authority
    // (fee-payer + `disputeAdmin` account), passed in explicitly. Every other
    // action is signed by the acting user, resolved from their linked wallet.
    const signerAddress =
      args.action === 'resolveDispute'
        ? args.signer_address
        : await deps.resolveWalletAddress(args.user_id)
    const wallet = new PublicKey(signerAddress)
    const instructions = await buildInstruction(deps, args, wallet)
    const { blockhash, last_valid_block_height } = await deps.rpc.getLatestBlockhash()
    const message = new TransactionMessage({
      payerKey: wallet,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message()
    const tx = new VersionedTransaction(message)
    return {
      kind: 'solana-tx',
      tx_base64: Buffer.from(tx.serialize()).toString('base64'),
      recent_blockhash: blockhash,
      last_valid_block_height,
    }
  }

  return { buildTx }
}
