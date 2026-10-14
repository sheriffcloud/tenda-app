/**
 * EVM call-data builders (stage-3-base.md § EVM adapter). Each escrow
 * action ABI-encodes against the TendaEscrow contract; the BuildTxArgs
 * action names match the Solidity function names 1:1, so the builder is a
 * thin payload→args mapping plus the native-value rule:
 *
 *   - createEscrow with native asset → value = amount
 *   - disputeEscrow with native asset → value = bond
 *   - everything else → value = 0
 *
 * ERC-20 escrows need their allowance satisfied before the call lands:
 * either the client approves first, or the payload carries an EIP-2612
 * `permit` and this builder encodes the *WithPermit entry point so the
 * allowance rides the same transaction.
 *
 * BOTH HALVES OF THAT DECISION LIVE HERE — `buildEvmCall` encodes the permit
 * path, and `approvalHint` below tells the wallet to approve separately when it
 * does not. They must never disagree (one would leave the transaction with no
 * allowance at all), and they were in two different files until the adapter
 * grew past its line budget; co-locating them is what makes the agreement
 * visible rather than a comment asking you to trust it.
 */

import { encodeFunctionData } from 'viem'
import { DISPUTE_WINNER_CODE, encodeApprove, type PermitSignatureBody } from '@tenda/shared'
import { ErrorCode } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { tagCalldata } from '@server/features/attribution'
import { ESCROW_EVM_ABI } from '../rpc'
import { parsePermitSignature } from './permit'
import { buildCreateParams, escrowIdHex } from './create-params'
import type { AmountRaw, BuildTxArgs } from '@server/chains/types'

export interface BuiltCall {
  data: `0x${string}`
  /** Native value the tx must carry (stringified wei). */
  value_raw: string
}

export interface BuildContext {
  /** AssetId → ERC-20 address (`null` = native). */
  asset_address: string | null
  /** Resolved wallet of assigned_counterparty_user_id, when present. */
  assigned_counterparty_address: string | null
  /**
   * Resolved wallet of `assignAccept`'s worker_user_id. Distinct from
   * `assigned_counterparty_address` on purpose: that one is a CREATE-time
   * invite the worker still has to accept, this one is the worker the creator
   * is placing right now. Both contracts reject an escrow that carries both.
   */
  worker_address: string | null
  /**
   * May this call encode a `*WithPermit` entry point?
   *
   * False when the escrow is held by a superseded contract: the permit was
   * signed with the CURRENT contract as spender (the permit-payload endpoint is
   * chain-scoped and takes no escrow), so it cannot authorise a pull by a
   * different one. The builder then encodes the plain entry point and the
   * approval hint takes over instead — see `encodesPermit` at the foot of this
   * file, which mirrors the condition `buildEvmCall` uses above it.
   */
  permit_encodable: boolean
}


/** Wire permit → the contract's `Permit` calldata tuple. ERC-20 only. */
function permitTuple(permit: PermitSignatureBody, asset_address: string | null) {
  if (asset_address === null) {
    // Routes validate this too, the builder is the last line of defense
    // (mirrors the contract's own NativeAssetPermit revert).
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'permit is not applicable to a native asset')
  }
  const sig = parsePermitSignature(permit.signature)
  return {
    value: BigInt(permit.value_raw),
    deadline: BigInt(permit.deadline_unix),
    v: sig.v,
    r: sig.r,
    s: sig.s,
  }
}

export function buildEvmCall(args: BuildTxArgs, ctx: BuildContext): BuiltCall {
  switch (args.action) {
    case 'createEscrow': {
      const p = args.payload
      const native = ctx.asset_address === null
      // The one CreateParams builder (create-params.ts) — the relayed path
      // hashes the same struct into its EIP-3009 nonce.
      const createParams = buildCreateParams(p, ctx)
      if (p.permit !== undefined && ctx.permit_encodable) {
        return {
          data: encodeFunctionData({
            abi: ESCROW_EVM_ABI,
            functionName: 'createEscrowWithPermit',
            args: [createParams, permitTuple(p.permit, ctx.asset_address)],
          }),
          value_raw: '0', // non-payable: the permit path is ERC-20 only
        }
      }
      return {
        data: encodeFunctionData({
          abi: ESCROW_EVM_ABI,
          functionName: 'createEscrow',
          args: [createParams],
        }),
        value_raw: native ? p.amount_raw : '0',
      }
    }
    case 'submitProof': {
      const p = args.payload
      return {
        data: encodeFunctionData({
          abi: ESCROW_EVM_ABI,
          functionName: 'submitProof',
          args: [escrowIdHex(p.escrow_id), p.proof_hash as `0x${string}`],
        }),
        value_raw: '0',
      }
    }
    case 'disputeEscrow': {
      const p = args.payload
      const native = ctx.asset_address === null
      if (p.permit !== undefined && ctx.permit_encodable) {
        return {
          data: encodeFunctionData({
            abi: ESCROW_EVM_ABI,
            functionName: 'disputeEscrowWithPermit',
            args: [escrowIdHex(p.escrow_id), permitTuple(p.permit, ctx.asset_address)],
          }),
          value_raw: '0',
        }
      }
      return {
        data: encodeFunctionData({
          abi: ESCROW_EVM_ABI,
          functionName: 'disputeEscrow',
          args: [escrowIdHex(p.escrow_id)],
        }),
        value_raw: native ? p.bond_raw : '0',
      }
    }
    case 'assignAccept': {
      const p = args.payload
      if (ctx.worker_address === null) {
        // The route resolves the worker's wallet; reaching the encoder
        // without one would silently assign address(0), which the contract
        // rejects — fail here with a typed error instead of a raw revert.
        throw new AppError(
          422,
          ErrorCode.VALIDATION_ERROR,
          'assignAccept requires a resolved worker wallet on this chain',
        )
      }
      return {
        data: encodeFunctionData({
          abi: ESCROW_EVM_ABI,
          functionName: 'assignAccept',
          args: [escrowIdHex(p.escrow_id), ctx.worker_address as `0x${string}`],
        }),
        value_raw: '0',
      }
    }
    case 'resolveDispute': {
      const p = args.payload
      return {
        data: encodeFunctionData({
          abi: ESCROW_EVM_ABI,
          functionName: 'resolveDispute',
          // raiser_user_id intentionally unused: the EVM contract records
          // raisedBy at disputeEscrow time (chains/types.ts documents this).
          args: [escrowIdHex(p.escrow_id), DISPUTE_WINNER_CODE[p.winner]],
        }),
        value_raw: '0',
      }
    }
    // Single-arg escrow-id actions share one encoding shape.
    case 'acceptEscrow':
    case 'declineAssignedEscrow':
    case 'approveCompletion':
    case 'claimStalledPayment':
    case 'cancelEscrow':
    case 'refundExpired':
    case 'reclaimAbandoned':
    case 'unassign':
      return {
        data: encodeFunctionData({
          abi: ESCROW_EVM_ABI,
          functionName: args.action,
          args: [escrowIdHex(args.payload.escrow_id)],
        }),
        value_raw: '0',
      }
  }
}

/**
 * ERC-20 prerequisite the wallet must satisfy before broadcasting a PLAIN
 * call: allowance(owner → escrow) ≥ the pull amount. Permit-built calls
 * carry their own allowance; native assets fund via msg.value.
 *
 * IT SHIPS THE CALLDATA, not just the terms (#103). The hint used to be
 * `{ token, spender, amount_raw }` and each client encoded the `approve` from
 * it — which meant the server had nothing to attach the ERC-8021 attribution
 * suffix to, so every approve went out unattributed. On a token WITHOUT
 * EIP-2612 that is not an edge case, it is one uncredited transaction per post
 * forever: cNGN has no permit (verified on-chain — no DOMAIN_SEPARATOR, no
 * nonces, no PERMIT_TYPEHASH), so the naira rail takes this path every time.
 * The tag rides signed calldata and there is no backfill, so a transaction sent
 * before this is permanently uncounted.
 *
 * `amount_raw` / `token` / `spender` STAY on the wire beside `data`, and the
 * reason was CHECKED rather than assumed — by narrowing the wire type to `data`
 * alone and reading the compiler's list of what broke. Exactly two files use
 * them, both `wallet/dispatch.ts`, and no UI renders them: `token` is the `to`
 * address, `spender` plus the owner are the `allowance()` read's arguments, and
 * `amount_raw` is the sufficiency comparison that decides whether an approve is
 * sent at all. `data` is only what gets broadcast IF one is; it answers none of
 * those three questions. (An earlier draft of this note said the confirm sheets
 * render them. They do not — the compiler says so.)
 *
 * Appending past a static two-argument call is safe by the ABI (trailing bytes
 * are not decoded) but was VERIFIED rather than argued: on Celo mainnet
 * 2026-09-06 an `eth_call` of this exact tagged calldata against cNGN — which
 * is a pausable, blacklist-capable proxy, not a vanilla ERC-20 — returned
 * `true`, as did the USDC_CELO control. Measured cost of the suffix: +845 gas
 * (56,409 -> 57,254 on cNGN).
 */
export function approvalHint(
  build: BuildTxArgs,
  ctx: { asset_address: string | null; permit_encodable: boolean },
  spender: `0x${string}`,
  chain_id: string,
): { approval?: { token: string; spender: string; amount_raw: AmountRaw; data: string } } {
  if (ctx.asset_address === null) return {}
  const token = ctx.asset_address

  // ONE encoder for `approve`, and it is the shared one the CLIENTS use — so
  // the calldata the server builds and the calldata a client would have built
  // cannot drift, and the selector lives in a single place.
  const approval = (amount_raw: AmountRaw) => ({
    approval: {
      token,
      spender,
      amount_raw,
      data: tagCalldata(chain_id, encodeApprove(spender, amount_raw)),
    },
  })

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
    return approval(build.payload.amount_raw)
  }
  if (
    build.action === 'disputeEscrow' &&
    !encodesPermit(build, ctx.permit_encodable) &&
    build.payload.bond_raw !== '0'
  ) {
    return approval(build.payload.bond_raw)
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
