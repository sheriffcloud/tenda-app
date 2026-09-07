/**
 * EVM ChainAdapter (stage-3-base.md), viem-backed, generic across EVM
 * chains: BASE here, CELO in Stage 4 (same adapter, different
 * EvmAdapterArgs). Slots into the Stage-0 registry beside the Solana
 * adapter; verify-tx, reconcile and the routes are untouched.
 *
 * Sponsorship: when the paymaster is configured AND lib/sponsor.ts says
 * the user qualifies, buildTx returns an `evm-userop` skeleton (calldata +
 * paymaster fields); otherwise a plain `evm-tx`. The reservation /
 * decrement lifecycle stays in lib/sponsor.ts + verify-tx (Stage 0
 * pattern).
 */

import { computePlatformFee } from '@server/lib/escrow'
import { verifyWalletSignature } from '@server/lib/wallet-signature'
import {
  type AmountRaw,
  type AssetId,
  type BuildTxArgs,
  type ChainAdapter,
  type ChainId,
  type UnsignedTx,
  type VerifiedTx,
  type VerifyAuthSigArgs,
  type VerifyTxArgs,
} from '@server/chains/types'
import { buildEvmCall } from './builders'
import { verifyEvmReceipt } from './verify-receipt'
import { createEvmRpc, type EvmRpc } from './rpc'
import { buildContext, fetchEscrowState, type EvmAdapterContext } from './state'
import { resolveEvmSigner } from './signer'
import { buildPermitPayload } from './permit-payload'
import { ENTRY_POINT_V06, type PaymasterHttp } from './paymaster'
import { evmEscrowRelay } from './relay'
import { evmEscrowSweep } from './sweep'
import type { EvmRelayer } from './relay/relayer'

export interface EvmAdapterDeps {
  /** user_id → the user's EVM wallet address (0x-hex). */
  resolveWalletAddress(user_id: string): Promise<string>
  /** AssetId → ERC-20 address (`null` = native). Throws on unknown. */
  resolveAsset(asset: AssetId): Promise<{ token_address: string | null }>
  /**
   * Should this user's next tx be sponsored? (lib/sponsor.ts policy,
   * remaining quota etc.). A `true` result has ALREADY reserved (decremented)
   * a quota slot, see `releaseSponsorship`. Absent = never sponsor.
   */
  shouldSponsor?(user_id: string): Promise<boolean>
  /**
   * Give back a quota slot reserved by `shouldSponsor` when the sponsored
   * build fails after reservation (paymaster outage / wallet-resolution
   * error). Without it the reserved slot leaks, the user loses a free tx
   * yet pays gas. Absent = no-op (chains that never reserve, e.g. CELO).
   */
  releaseSponsorship?(user_id: string): Promise<void>
  /**
   * Is `address` one of the user's VERIFIED linked eip155 wallets? Gates
   * permit-payload building: the permit's owner must be an account the
   * caller actually controls (and will send from). Absent = permit payloads
   * unavailable on this adapter instance.
   */
  verifyWalletOwnership?(user_id: string, address: string): Promise<boolean>
  /** Test seam: replace the network-backed RPC with a fake. */
  rpc?: EvmRpc
  /** Paymaster endpoint seam; absent = sponsorship unavailable. */
  paymaster?: PaymasterHttp
  /** Relayer hot wallet (#18); absent = relayed funding unavailable. */
  relayer?: EvmRelayer
  /** May this chain spend the relayer float on sweeps (#43)? Default false;
   *  the wallet says a sweep is POSSIBLE, this says it is wanted. */
  sweepEnabled?: boolean
}

export interface EvmAdapterArgs {
  /** CAIP-2 id, e.g. `'eip155:8453'`. */
  chain_id: ChainId
  rpc_url: string
  /** Secondary RPC endpoint, failover on primary errors/timeouts. */
  rpc_url_fallback?: string
  /** Deployed TendaEscrow address on this chain — the CURRENT one. */
  escrow_contract: `0x${string}`
  /**
   * Every TendaEscrow this chain has run, current included, from
   * `chain_contracts`. Receipts are decoded against all of them so a transaction
   * against a superseded contract still verifies instead of being recorded as a
   * failure (open_issues #89).
   *
   * Optional, defaulting to `[escrow_contract]`: absent means "only the current
   * contract is known", which is exactly the behaviour before this existed, so a
   * caller that has no registry (unit tests, one-off scripts) is unchanged.
   */
  escrow_contracts?: readonly string[]
  /** Reorg safety margin before a receipt counts as confirmed. */
  min_confirmations: number
  /**
   * CELO-style gas abstraction: when set, every plain tx carries
   * `feeCurrency` so the user pays gas in stables (stage-4 final policy:
   * always-on for CELO, no counter, no paymaster).
   */
  fee_currency?: `0x${string}`
  /** Configured dispute-resolution authority (0x address), if any. */
  dispute_authority?: string
  deps: EvmAdapterDeps
}

export function evmAdapter(args: EvmAdapterArgs): ChainAdapter {
  const rpc =
    args.deps.rpc ??
    createEvmRpc({
      rpc_url: args.rpc_url,
      ...(args.rpc_url_fallback !== undefined ? { rpc_url_fallback: args.rpc_url_fallback } : {}),
    })

  // The dependencies the extracted reads used to CLOSE OVER, now named. Built
  // once per adapter, same lifetime as the closure it replaces.
  const context: EvmAdapterContext = { args, rpc }

  async function buildTx(build: BuildTxArgs): Promise<UnsignedTx> {
    // The contract THIS escrow's funds sit in, defaulting to the current one.
    // Everything downstream — the call target, the ERC-20 spender, the on-chain
    // reads that decide bond denomination — must agree on this single value, or
    // the transaction is built for one contract and paid to another.
    const target = (build.contract ?? args.escrow_contract) as `0x${string}`
    const ctx = await buildContext(context, build, target)
    const call = buildEvmCall(build, ctx)
    // The signer contract: the account this call must be sent from — the
    // chain-bound party address for transitions, the client-declared wallet
    // for create. Null = unknown (fail-open read) → the field is omitted and
    // the client behaves as before it existed. Runs before the sponsorship
    // fork so a bound-mismatch 422 can never be eaten by the degradation
    // catch below.
    const signer = await resolveEvmSigner(context, build, target, ctx.escrow_state)

    const sponsorable =
      args.deps.paymaster !== undefined &&
      // resolveDispute is signed by the configured dispute authority (an EOA
      // paying its own gas), never sponsored — a userop would also target the
      // wrong sender and the admin signer can't sign one.
      build.action !== 'resolveDispute' &&
      call.value_raw === '0' && // paymasters won't fund msg.value
      (await (args.deps.shouldSponsor?.(build.user_id) ?? Promise.resolve(false)))

    if (sponsorable && args.deps.paymaster !== undefined) {
      // A quota slot was reserved in shouldSponsor(). EVERY exit from here on
      // must either keep it (sponsored build succeeds) or release it (any
      // failure → plain-tx degradation), wallet resolution included, so it
      // sits inside the try.
      try {
        // The userop's sender IS the signer: the resolved (chain-bound or
        // client-declared) address when known, else the primary — sponsoring
        // the primary for an escrow bound to another wallet would mint an
        // operation the bound wallet cannot use.
        const sender = (signer ?? (await args.deps.resolveWalletAddress(build.user_id))) as `0x${string}`
        const sponsored = await args.deps.paymaster.sponsorUserOperation(
          { sender, call_data: call.data },
          ENTRY_POINT_V06,
        )
        return {
          kind: 'evm-userop',
          entry_point: ENTRY_POINT_V06,
          signer_address: sender,
          user_op: {
            sender,
            nonce: '0x0', // bundler-resolved client-side (EOA 4337 flow)
            init_code: '0x',
            call_data: call.data,
            call_gas_limit: sponsored.call_gas_limit,
            verification_gas_limit: sponsored.verification_gas_limit,
            pre_verification_gas: sponsored.pre_verification_gas,
            max_fee_per_gas: '0x0',
            max_priority_fee_per_gas: '0x0',
            paymaster_and_data: sponsored.paymaster_and_data,
            signature: '0x',
          },
        }
      } catch {
        // Documented degradation: sponsorship unavailable → user pays gas
        // (~$0.01 on BASE). Release the reserved slot so it isn't burned for
        // a sponsorship the user never received, then fall through to the
        // plain tx. Best-effort: a release hiccup must NOT turn the
        // degradation into a hard failure, residual drift is swept by the
        // Stage-3 sponsored-tx reconcile (#45, open_issues X3).
        try {
          await args.deps.releaseSponsorship?.(build.user_id)
        } catch {
          // swallow, never block the build on a refund failure
        }
      }
    }

    return {
      kind: 'evm-tx',
      to: target,
      data: call.data,
      value: call.value_raw,
      ...(signer !== null ? { signer_address: signer } : {}),
      ...(args.fee_currency !== undefined ? { fee_currency: args.fee_currency } : {}),
      ...approvalHint(build, ctx, target),
    }
  }

  /**
   * ERC-20 prerequisite the wallet must satisfy before broadcasting a PLAIN
   * call: allowance(owner → escrow) ≥ the pull amount. Permit-built calls
   * carry their own allowance; native assets fund via msg.value.
   */
  function approvalHint(
    build: BuildTxArgs,
    ctx: { asset_address: string | null; permit_encodable: boolean },
    spender: `0x${string}`,
  ): { approval?: { token: string; spender: string; amount_raw: AmountRaw } } {
    if (ctx.asset_address === null) return {}
    const token = ctx.asset_address

    // Driven by what the call ACTUALLY encodes, never by what the caller
    // supplied. A permit that `buildEvmCall` declines to encode (its spender
    // cannot match a superseded contract) still leaves the pull needing an
    // allowance, so the hint has to take over — and both branches must agree on
    // that, or one of them emits neither a permit nor a hint and the
    // transaction reverts on a zero allowance.
    //
    // The spender is the contract that will actually pull the tokens: the
    // escrow's own, not the chain's current one.
    if (build.action === 'createEscrow' && !encodesPermit(build, ctx.permit_encodable)) {
      return { approval: { token, spender, amount_raw: build.payload.amount_raw } }
    }
    if (
      build.action === 'disputeEscrow' &&
      !encodesPermit(build, ctx.permit_encodable) &&
      build.payload.bond_raw !== '0'
    ) {
      return { approval: { token, spender, amount_raw: build.payload.bond_raw } }
    }
    return {}
  }

  /**
   * Will this build encode a `*WithPermit` entry point?
   *
   * Mirrors `buildEvmCall`'s condition exactly — the two must not be able to
   * disagree, since one decides whether the allowance rides the transaction and
   * the other whether the wallet is told to grant it separately.
   *
   * `permit_encodable` is decided once, in `buildContext`: a permit's spender is
   * fixed when the payload is signed, and `/v1/blockchain/permit-payload` mints
   * it for the chain's CURRENT contract (it takes no escrow and cannot know
   * about a superseded one), so against any other contract the signature is
   * unusable by construction.
   */
  function encodesPermit(build: BuildTxArgs, permit_encodable: boolean): boolean {
    if (build.action !== 'createEscrow' && build.action !== 'disputeEscrow') return false
    return build.payload.permit !== undefined && permit_encodable
  }

  // Current first, so a receipt carrying logs from two generations decodes the
  // live one. Lower-cased before deduping because the two inputs reach here from
  // different places — `escrow_contract` straight from the chain secret, which is
  // usually checksummed deploy output, and `escrow_contracts` from the registry,
  // which normalises — so comparing raw would keep one contract twice under two
  // spellings.
  const knownContracts: readonly string[] = [
    ...new Set(
      [args.escrow_contract, ...(args.escrow_contracts ?? [])].map((c) => c.toLowerCase()),
    ),
  ]

  function verifyTx(tx_ref: string, verify: VerifyTxArgs): Promise<VerifiedTx> {
    return verifyEvmReceipt(
      {
        rpc,
        chain_id: args.chain_id,
        escrow_contracts: knownContracts,
        min_confirmations: args.min_confirmations,
      },
      tx_ref,
      verify,
    )
  }

  return {
    namespace: 'eip155',
    chain_id: args.chain_id,
    disputeAuthority: args.dispute_authority,
    // The contract every tx in this adapter targets — see ChainAdapter.
    escrowAddress: args.escrow_contract,
    buildTx,
    buildPermitPayload: (payload_args) => buildPermitPayload(context, payload_args),
    ...(args.deps.relayer !== undefined ? { relay: evmEscrowRelay(context, args.deps.relayer) } : {}),
    // BOTH: a wallet that can pay, and the operator's say-so (#43).
    ...(args.deps.relayer !== undefined && args.deps.sweepEnabled === true
      ? { sweep: evmEscrowSweep(args.deps.relayer) }
      : {}),
    verifyTx,
    // Namespace-level crypto (EIP-191 ecrecover), single source in
    // lib/wallet-signature; the registry's verifyAuthSig delegates to the same.
    verifyAuthSig: (a: VerifyAuthSigArgs) => verifyWalletSignature('eip155', a),
    fetchEscrowState: (escrow_ref) => fetchEscrowState(context, escrow_ref),
    computeFee: (fee_args) => computePlatformFee(fee_args),
  }
}
