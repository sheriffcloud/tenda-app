/**
 * The `ChainAdapter` port itself, plus the RPC / listener / push / registry
 * surfaces that sit alongside it.
 */

import type { ChainNamespace } from '@tenda/shared/db/schema/chains'
import type { PermitPayloadResponse } from '@tenda/shared'
import type { AmountRaw, AssetId, ChainId } from './values'
import type { BuildTxArgs, UnsignedTx } from './build-tx'
import type { EscrowState, VerifiedTx, VerifyAuthSigArgs, VerifyTxArgs } from './verify'
import type { EscrowRelay } from './relay'
import type { EscrowSweep } from './sweep'

// ---------- adapter -------------------------------------------------------

export interface ChainAdapter {
  readonly namespace: ChainNamespace
  readonly chain_id: ChainId

  /**
   * Public address of this chain's configured dispute-resolution authority
   * (from its secret), or undefined when unset. Single source for BOTH the
   * admin sign pre-flight (connected wallet must equal this) AND the resolve
   * tx's signer/fee-payer, so the two can never drift apart.
   */
  readonly disputeAuthority?: string

  /**
   * The escrow program/contract this adapter transacts with — EVM's deployed
   * address, Solana's program id.
   *
   * On the adapter, and not read from the DB, because mobile signs its own
   * transactions: `/v1/platform/chains` has to TELL the client which contract
   * to call, and the only address that can be right is the one the server
   * itself uses. `chains.escrow_program` is written solely by `db:seed`, so it
   * sat two contract generations stale on both EVM testnets after a redeploy
   * (2026-07-27) — served to clients as fact, with nothing failing server-side
   * because the server never read it.
   */
  readonly escrowAddress: string

  /** Build an unsigned transaction the client will sign. */
  buildTx(args: BuildTxArgs): Promise<UnsignedTx>

  /** Verify a confirmed tx + decode its event. Idempotent. */
  verifyTx(tx_ref: string, args: VerifyTxArgs): Promise<VerifiedTx>

  /** Verify the user's wallet-sig over the auth message. */
  verifyAuthSig(args: VerifyAuthSigArgs): Promise<boolean>

  /**
   * Latest on-chain escrow state for reconciliation. Null = no account.
   *
   * Reads the chain's CURRENT contract — it takes no escrow, so it cannot know
   * about a superseded one, and for an escrow funded before a redeploy it will
   * answer `null` rather than the truth. That is safe for the probe semantics it
   * has today (no production callers; the adapters' own internal reads take the
   * per-escrow contract explicitly), but a future caller acting on this must
   * resolve the contract first — see `chains/contracts` and open_issues #89.
   */
  fetchEscrowState(escrow_ref: string): Promise<EscrowState | null>

  /**
   * Build the EIP-712 typed data for an EIP-2612 permit (EVM only, absent
   * on chains without token-permit semantics; the route maps absence to a
   * typed PERMIT_UNAVAILABLE so clients fall back to the approve flow).
   * `owner` MUST already be verified as one of the caller's linked wallets.
   */
  buildPermitPayload?(args: {
    user_id: string
    owner: string
    asset: AssetId
    value_raw: AmountRaw
  }): Promise<PermitPayloadResponse>

  /**
   * Relayed funding (x402, #18): present only when this chain has a relayer
   * hot wallet configured (`CHAIN_<ID>_RELAYER_KEY`). Absent = the fund route
   * answers RELAY_UNAVAILABLE and the caller signs its own create.
   */
  readonly relay?: EscrowRelay

  /**
   * Abandoned-escrow recovery (#43): present only when this chain's deployed
   * contract lets a third party trigger the creator's own refund. Absent =
   * nothing sweeps there and the job skips the chain, which is the correct
   * behaviour for Solana until #42 and for any EVM chain still on a
   * pre-#43 contract generation.
   */
  readonly sweep?: EscrowSweep

  /**
   * Platform fee in raw units. Same surface as `lib/escrow.ts:computePlatformFee`
   *, adapter delegates to the shared implementation; lives on the interface so
   * adapter consumers don't have to import from two places.
   */
  computeFee(args: {
    amount_raw: AmountRaw
    is_seeker: boolean
    fee_bps: number
    seeker_fee_bps: number
  }): AmountRaw
}

// ---------- RPC + listener + push (split, used by Stage 2+) ---------------

export interface RpcProvider {
  readonly chain_id: ChainId
  /** Direct RPC fetch, reconciliation only, not request path. */
  getTransactionStatus(tx_ref: string): Promise<'unknown' | 'pending' | 'confirmed' | 'failed'>
}

export interface ChainListener {
  start(): Promise<void>
  stop(): Promise<void>
}

export interface PushService {
  /** Per-batch limit and provider-specific error mapping handled internally. */
  send(args: {
    tokens: ReadonlyArray<string>
    title: string
    body: string
    data?: Record<string, string>
  }): Promise<{
    ok: number
    failed: number
    /**
     * Tokens the provider reported as permanently GONE (Expo
     * DeviceNotRegistered / FCM UNREGISTERED / APNs 410), callers prune
     * these from device_tokens. Transient failures are NOT included.
     */
    invalid_tokens: string[]
  }>
}

// ---------- registry shape (concrete instance in `chains/index.ts`) -------

export interface ChainRegistry {
  get(chain_id: ChainId): ChainAdapter
  has(chain_id: ChainId): boolean
  list(): ReadonlyArray<ChainAdapter>
  /**
   * Verify a wallet auth-signature for `chain_id` by NAMESPACE, pure offline
   * crypto that works even when the chain is NOT provisioned on this deployment
   * (so login never requires a deployed escrow contract). 400 on an unsupported
   * namespace. Distinct from per-chain `get(id).verifyTx` (which needs RPC).
   */
  verifyAuthSig(chain_id: string, args: VerifyAuthSigArgs): Promise<boolean>
}
