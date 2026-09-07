/**
 * Relayed create on EVM (#18): the 402 terms are an EIP-3009 authorization
 * for exactly the draft's CreateParams; the artifact is its signature; the
 * relay is `createEscrowFor(creator, params, auth)` sent by the hot wallet.
 *
 * The signer is the creator and msg.sender is never a party (contract rule),
 * so the only thing the relayer can do with a signature is create the escrow
 * the signer asked for — and it checks that before spending gas.
 */
import { encodeFunctionData } from 'viem'
import {
  ErrorCode,
  RELAY_QUOTE_TTL_SECONDS,
  TENDA_RELAY_SCHEME,
  chainById,
  type RelayPaymentPayload,
  type RelayTerms,
} from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { assertRelayEnvelope, relayRejected as rejected } from '@server/lib/x402'
import type { EscrowRelay, RelayedCreateArgs } from '@server/chains/types'
import { ESCROW_EVM_ABI } from '../rpc'
import { evmChainNumericId } from '@tenda/shared'
import { domainSeparatorMatches } from '../permit'
import { authorizationNonce, buildCreateParams, createParamsWire, type EvmCreateParams } from '../create-params'
import type { EvmAdapterContext } from '../state'
import {
  buildAuthorizationTypedData,
  validateAuthorizationPayment,
  verifyAuthorizationSignature,
  type AuthorizationTerms,
} from './authorization'
import type { EvmRelayer } from './relayer'

function unavailable(reason: string): never {
  throw new AppError(422, ErrorCode.RELAY_UNAVAILABLE, `relayed funding unavailable: ${reason}`)
}

/** Everything both quote and relay derive from the draft, resolved once per call. */
interface RelayContext {
  token: `0x${string}`
  params: EvmCreateParams
  nonce: `0x${string}`
  domain: Pick<AuthorizationTerms, 'token_name' | 'version' | 'chain_numeric_id'>
}

export function evmEscrowRelay(ctx: EvmAdapterContext, relayer: EvmRelayer): EscrowRelay {
  const chain_id = ctx.args.chain_id
  const contract = ctx.args.escrow_contract

  async function resolve(args: RelayedCreateArgs): Promise<RelayContext> {
    const config = chainById(chain_id).assets.find((a) => a.id === args.payload.asset)
    if (config?.eip3009 === undefined || config.permit === undefined) {
      unavailable(`asset '${args.payload.asset}' cannot fund an escrow by signature on ${chain_id}`)
    }
    const { token_address } = await ctx.args.deps.resolveAsset(args.payload.asset)
    if (token_address === null) unavailable(`asset '${args.payload.asset}' is native on ${chain_id}`)
    const token = token_address as `0x${string}`
    if (!(await relayer.supportsReceiveWithAuthorization(token))) {
      unavailable(`token ${token} does not implement EIP-3009 receiveWithAuthorization`)
    }
    const assigned =
      args.payload.assigned_counterparty_user_id !== undefined
        ? await ctx.args.deps.resolveWalletAddress(args.payload.assigned_counterparty_user_id)
        : null
    const params = buildCreateParams(args.payload, {
      asset_address: token,
      assigned_counterparty_address: assigned,
    })
    const facts = await ctx.rpc.readPermitFacts(token, args.creator_address as `0x${string}`)
    const domain = {
      token_name: facts.name,
      version: config.permit.version,
      chain_numeric_id: evmChainNumericId(chain_id),
    }
    // The reconstructed domain must hash to the token's LIVE separator, the
    // same guard the permit payload runs: never hand out unsignable terms.
    const eip712Domain = {
      name: domain.token_name,
      version: domain.version,
      chainId: domain.chain_numeric_id,
      verifyingContract: token,
    }
    if (!domainSeparatorMatches(eip712Domain, facts.domain_separator)) {
      unavailable(`token domain mismatch for '${args.payload.asset}' on ${chain_id}`)
    }
    return { token, params, nonce: authorizationNonce(params), domain }
  }

  function typedDataFor(r: RelayContext, args: RelayedCreateArgs, valid_after: bigint, valid_before: bigint) {
    return buildAuthorizationTypedData({
      ...r.domain,
      token: r.token,
      from: args.creator_address,
      to: contract,
      value_raw: args.payload.amount_raw,
      valid_after,
      valid_before,
      nonce: r.nonce,
    })
  }

  return {
    relayer_address: relayer.address,

    async quote(args): Promise<RelayTerms> {
      const r = await resolve(args)
      const now_unix = Math.floor(Date.now() / 1000)
      const expires_at_unix = now_unix + RELAY_QUOTE_TTL_SECONDS
      return {
        scheme: TENDA_RELAY_SCHEME,
        network: chain_id,
        asset: r.token,
        asset_id: args.payload.asset,
        amount_raw: args.payload.amount_raw,
        pay_to: contract,
        escrow_id: args.payload.escrow_id,
        max_timeout_seconds: RELAY_QUOTE_TTL_SECONDS,
        expires_at_unix,
        payment: {
          kind: 'eip155-authorization',
          creator: args.creator_address,
          create_params: createParamsWire(r.params),
          // validAfter 0: valid the moment it is signed (the window is
          // exclusive, so "now" would refuse a same-second relay).
          typed_data: typedDataFor(r, args, 0n, BigInt(expires_at_unix)),
        },
      }
    },

    async relay(args: RelayedCreateArgs & { payment: RelayPaymentPayload }) {
      // The envelope is refused before a single RPC read — a foreign scheme
      // must cost nothing. validateAuthorizationPayment re-checks it, which
      // keeps that function whole on its own.
      assertRelayEnvelope(args.payment, chain_id)
      const r = await resolve(args)
      const auth = validateAuthorizationPayment({
        payment: args.payment,
        expected: {
          network: chain_id,
          from: args.creator_address,
          to: contract,
          value_raw: args.payload.amount_raw,
          nonce: r.nonce,
        },
        now_unix: Math.floor(Date.now() / 1000),
      })
      const typed = typedDataFor(r, args, auth.valid_after, auth.valid_before)
      if (!(await verifyAuthorizationSignature(typed, auth.signature, auth.from))) {
        rejected('signature does not recover to the creator over the quoted terms')
      }
      const call = {
        to: contract,
        data: encodeFunctionData({
          abi: ESCROW_EVM_ABI,
          functionName: 'createEscrowFor',
          args: [
            auth.from,
            r.params,
            { validAfter: auth.valid_after, validBefore: auth.valid_before, v: auth.v, r: auth.r, s: auth.s },
          ],
        }),
      }
      try {
        await relayer.simulate(call)
      } catch (err) {
        rejected(`simulation failed: ${err instanceof Error ? err.message : String(err)}`)
      }
      const tx_ref = await relayer.send(call)
      return { tx_ref }
    },
  }
}
