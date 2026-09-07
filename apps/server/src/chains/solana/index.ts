/**
 * Solana ChainAdapter, full Stage 0 implementation against the rewritten
 * escrow program (#29).
 *
 *   - `buildTx`: all 11 escrow actions, SOL/SPL instruction forking from
 *     on-chain state (`builders.ts`).
 *   - `verifyTx` / `fetchEscrowState`: event + account decoding (`verify.ts`).
 *   - `verifyAuthSig`: tweetnacl Ed25519 over the auth-message bytes.
 *   - `computeFee`: delegates to `lib/escrow.ts:computePlatformFee`, single
 *     source of truth for fee math across chains.
 *
 * Wallet + asset resolution are injected (`SolanaAdapterDeps`): the live
 * implementations (plugins/chains.ts) read `user_wallets` and the seeded
 * `assets` registry, the adapter itself never touches the DB.
 */

import { Program } from '@coral-xyz/anchor'
import { Connection } from '@solana/web3.js'
import { ESCROW_IDL, type TendaEscrow } from '@tenda/shared/idl'
import { computePlatformFee } from '@server/lib/escrow'
import { verifyWalletSignature } from '@server/lib/wallet-signature'
import { createSolanaBuilders } from '@server/chains/solana/builders'
import { PROGRAM_ID } from '@server/chains/solana/pdas'
import { createSolanaRpc, commitmentFor, type SolanaRpc } from '@server/chains/solana/rpc'
import { createSolanaVerifier } from '@server/chains/solana/verify'
import type {
  AmountRaw,
  AssetId,
  ChainAdapter,
  ChainId,
  VerifyAuthSigArgs,
} from '@server/chains/types'

export interface SolanaAdapterDeps {
  /** user_id → the user's Solana wallet address (base58). */
  resolveWalletAddress(user_id: string): Promise<string>
  /** AssetId → SPL mint address (`null` = native SOL). Throws on unknown. */
  resolveAsset(asset: AssetId): Promise<{ token_address: string | null }>
  /** Test seam: replace the network-backed RPC with a fake. */
  rpc?: SolanaRpc
}

export interface SolanaAdapterArgs {
  /** CAIP-2 id, e.g. `'solana:mainnet'` or `'solana:devnet'`. */
  chain_id: ChainId
  /** RPC endpoint URL from `SOLANA_RPC_URL`. */
  rpc_url: string
  rpc_url_fallback?: string
  /** Configured dispute-resolution authority (base58), if any. */
  dispute_authority?: string
  deps: SolanaAdapterDeps
}

export function solanaAdapter(args: SolanaAdapterArgs): ChainAdapter {
  const rpc =
    args.deps.rpc ?? createSolanaRpc({
      rpc_url: args.rpc_url,
      ...(args.rpc_url_fallback !== undefined ? { rpc_url_fallback: args.rpc_url_fallback } : {}),
      chain_id: args.chain_id,
    })

  // The Program instance encodes instructions only; its Connection is never
  // used for fetches (all reads go through `rpc`), so construction is free.
  const program = new Program<TendaEscrow>(ESCROW_IDL, {
    connection: new Connection(args.rpc_url, commitmentFor(args.chain_id)),
  })

  const builders = createSolanaBuilders({
    rpc,
    program,
    resolveWalletAddress: args.deps.resolveWalletAddress,
    resolveAsset: args.deps.resolveAsset,
  })
  const verifier = createSolanaVerifier({ rpc, chain_id: args.chain_id, program })

  return {
    namespace: 'solana',
    chain_id: args.chain_id,
    disputeAuthority: args.dispute_authority,
    // The program this adapter talks to. Same source the PDAs derive from, so
    // the address served to clients cannot disagree with the one we transact on.
    escrowAddress: PROGRAM_ID.toBase58(),
    buildTx: builders.buildTx,
    verifyTx: verifier.verifyTx,
    fetchEscrowState: verifier.fetchEscrowState,

    // Namespace-level crypto (ed25519), single source in lib/wallet-signature;
    // the registry's verifyAuthSig delegates to the same.
    verifyAuthSig: (a: VerifyAuthSigArgs) => verifyWalletSignature('solana', a),

    computeFee(fee_args): AmountRaw {
      return computePlatformFee(fee_args)
    },
  }
}

/** Ed25519 auth-sig check, re-exported from the single source for callers/tests. */
export { verifyEd25519 } from '@server/lib/wallet-signature'
