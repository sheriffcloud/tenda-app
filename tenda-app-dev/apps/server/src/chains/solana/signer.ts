/**
 * Which wallet a Solana escrow transaction is built FOR — the address baked
 * in as fee-payer and signer account, so getting it wrong produces a tx the
 * connected wallet cannot sign (the reported multi-wallet failure).
 *
 * The rule, in trust order:
 *  - resolveDispute: the chain's dispute authority, passed in explicitly.
 *  - createEscrow: no binding exists yet — the client-requested wallet
 *    (route-validated as the caller's), else the primary linked wallet.
 *  - everything else: the CHAIN-BOUND party address for the caller's role,
 *    read from the escrow account the build already fetched. The chain is
 *    the authority; a client request that disagrees is refused by name so
 *    the client can re-target (and rebuild a permit) BEFORE signing.
 *  - public accept: `counterparty` is still null on-chain — the signature
 *    is what CREATES the binding — so it falls through to the free rule.
 */
import { ErrorCode, sameWalletAddress } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import type { BuildTxArgs } from '@server/chains/types'
import type { EscrowAccount } from '@server/chains/solana/pdas'
import type { SolanaBuilderDeps } from '@server/chains/solana/builder-internals'
import { boundPartyAddress } from '@server/chains/signer-role'

/** The three fields the resolver reads — structural so tests need no full
 *  IDL account, and the real EscrowAccount always satisfies it. */
export type EscrowSignerFields = Pick<EscrowAccount, 'creator' | 'counterparty' | 'assignedCounterparty'>

/** This chain's account, mapped into the SHARED role rule (signer-role.ts). */
function boundAddressFor(
  caller: NonNullable<BuildTxArgs['caller']>,
  escrow: EscrowSignerFields,
): string | null {
  return boundPartyAddress(caller, {
    creator: escrow.creator.toBase58(),
    counterparty: escrow.counterparty?.toBase58() ?? null,
    assigned_counterparty: escrow.assignedCounterparty?.toBase58() ?? null,
  })
}

export async function resolveSolanaSigner(
  deps: Pick<SolanaBuilderDeps, 'resolveWalletAddress'>,
  args: BuildTxArgs,
  /** The on-chain escrow account, null only for createEscrow. */
  escrow: EscrowSignerFields | null,
): Promise<string> {
  if (args.action === 'resolveDispute') return args.signer_address

  const requested = args.signer_address
  if (escrow !== null && args.caller !== undefined) {
    const bound = boundAddressFor(args.caller, escrow)
    if (bound !== null) {
      // The SHARED case rule (exact on solana base58) — never re-inlined.
      if (requested !== undefined && !sameWalletAddress('solana', requested, bound)) {
        throw new AppError(
          422,
          ErrorCode.ESCROW_WRONG_WALLET,
          `this escrow must be signed by ${bound} — the wallet that entered it on-chain`,
          { required_address: bound },
        )
      }
      return bound
    }
  }
  // Free: create, or a public accept (no binding yet). The route has already
  // validated a requested wallet as the caller's; absent means the primary —
  // the exact pre-existing behaviour, which is what keeps mobile unchanged.
  return requested ?? deps.resolveWalletAddress(args.user_id)
}
