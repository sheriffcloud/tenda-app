/**
 * EIP-2612 permit payload assembly — the typed data a client signs so the
 * escrow can pull an ERC-20 without a separate approve transaction.
 *
 * Lifted out of the `evmAdapter` closure: 70 lines of capability checks and
 * ownership proof that had nothing to do with building an escrow call. The
 * primitives it composes already lived in ./permit; this is the ORCHESTRATION
 * that turns a request into a signable payload, and it refuses in five distinct
 * ways, each of which the caller is meant to fall back to the approve flow on.
 */

import { isAddress } from 'viem'
import { chainById, ErrorCode, type PermitPayloadResponse } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { isAmountRaw, type AmountRaw, type AssetId } from '@server/chains/types'
import { evmChainNumericId } from '@tenda/shared'
import {
  buildPermitTypedData,
  PERMIT_DEADLINE_SECONDS,
  permitDomainMatches,
} from './permit'
import type { EvmAdapterContext } from './state'

export async function buildPermitPayload(
  ctx: EvmAdapterContext,
  payload_args: {
    user_id: string
    owner: string
    asset: AssetId
    value_raw: AmountRaw
  },
): Promise<PermitPayloadResponse> {
  const { user_id, owner, asset, value_raw } = payload_args
  if (!isAddress(owner)) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'owner must be a 0x-hex EVM address')
  }
  if (!isAmountRaw(value_raw) || value_raw === '0') {
    throw new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      'value_raw must be a positive canonical integer string',
    )
  }
  // The permit owner must be an account the caller controls AND will send
  // from, client-supplied, server-verified against verified linked wallets.
  const owned = (await ctx.args.deps.verifyWalletOwnership?.(user_id, owner)) ?? false
  if (!owned) {
    throw new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      'owner is not one of your verified linked wallets on this chain',
    )
  }
  // Capability is config: no manifest permit entry → approve flow.
  const permit_config = chainById(ctx.args.chain_id).assets.find((a) => a.id === asset)?.permit
  if (permit_config === undefined) {
    throw new AppError(
      422,
      ErrorCode.PERMIT_UNAVAILABLE,
      `asset '${asset}' has no EIP-2612 permit support on ${ctx.args.chain_id}, use the approve flow`,
    )
  }
  const { token_address } = await ctx.args.deps.resolveAsset(asset)
  if (token_address === null) {
    throw new AppError(
      422,
      ErrorCode.PERMIT_UNAVAILABLE,
      `asset '${asset}' is native on ${ctx.args.chain_id}, no allowance needed`,
    )
  }

  const facts = await ctx.rpc.readPermitFacts(token_address as `0x${string}`, owner)
  const deadline_unix = Math.floor(Date.now() / 1000) + PERMIT_DEADLINE_SECONDS
  const typed_data = buildPermitTypedData({
    token_name: facts.name,
    permit_version: permit_config.version,
    chain_numeric_id: evmChainNumericId(ctx.args.chain_id),
    token: token_address,
    owner,
    spender: ctx.args.escrow_contract,
    value_raw,
    nonce: facts.nonce,
    deadline_unix,
  })
  // Runtime guard: the reconstructed domain must hash to the token's LIVE
  // DOMAIN_SEPARATOR, a token rename/upgrade degrades to the approve flow
  // instead of producing signatures the token would reject.
  if (!permitDomainMatches(typed_data, facts.domain_separator)) {
    throw new AppError(
      422,
      ErrorCode.PERMIT_UNAVAILABLE,
      `token domain mismatch for '${asset}' on ${ctx.args.chain_id}, use the approve flow`,
    )
  }
  return { typed_data, value_raw, deadline_unix }
}
