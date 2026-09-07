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
import { fetchEscrow, type SolanaBuilderDeps } from '@server/chains/solana/builder-internals'
import { resolveSolanaSigner } from '@server/chains/solana/signer'

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

    // ONE account read per build, shared by signer resolution and instruction
    // encoding. createEscrow has no on-chain account yet — the fetch would 404.
    const fetched = args.action === 'createEscrow' ? null : await fetchEscrow(deps, args.payload.escrow_id)
    // The signer contract: transitions on an existing escrow are built FOR the
    // chain-bound party address (never the primary-wallet guess); create and
    // public accept take the route-validated requested wallet, else primary;
    // resolveDispute keeps its explicit authority (see solana/signer.ts).
    const signerAddress = await resolveSolanaSigner(deps, args, fetched?.escrow ?? null)
    const wallet = new PublicKey(signerAddress)
    const instructions = await buildInstruction(deps, args, wallet, fetched)
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
      signer_address: signerAddress,
    }
  }

  return { buildTx }
}
