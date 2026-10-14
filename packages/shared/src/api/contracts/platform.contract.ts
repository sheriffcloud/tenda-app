import type { Endpoint } from '../endpoint'
import type { SupportedCurrency } from '../../constants/currencies'
import type { AssetRole, ChainKind } from '../../chains/manifest'

export interface PlatformConfig {
  fee_bps: number
  seeker_fee_bps: number
  /**
   * Slack after `completion_deadline` before the creator may reclaim, in
   * seconds — the submit / reclaim / release windows are all
   * `completion_deadline + grace` (see GigCTABar). Defaults to 1 hour.
   *
   * NOT the poster's review window, which this doc used to call it. That
   * window is a CONTRACT value, different per chain (Celo mainnet 24h, the
   * testnets 48h), published as `approval_window_seconds` on each
   * `ChainRegistryEntry` and stamped onto each escrow as `approval_deadline`
   * when proof lands — a client deciding "can I claim" reads the escrow. The
   * mislabel is worth naming because the two differ by a day or more and the
   * wrong one is the one on the wire.
   */
  grace_period_seconds: number
}

export interface ExchangeRates {
  rates: Partial<Record<SupportedCurrency, number>>
  fetched_at: number
}

/** Enabled chain + its enabled assets (CO5 chain/asset picker source). */
export interface ChainRegistryEntry {
  id: string
  namespace: 'solana' | 'eip155'
  display_name: string
  /**
   * `mainnet` or `testnet` — a fact about the chain, from the manifest (#139).
   * Without it a reader cannot tell a null `faucet_url` that means "real money,
   * no free source" from one that means "a testnet mock with an open mint()".
   * Named `network_kind`, not `kind`: the 402 already carries `kind` twice with
   * other meanings (the escrow type in create_params, the payment mechanism),
   * and `network` is the 402's word for the CAIP-2 chain id.
   */
  network_kind: ChainKind
  /** Deployed escrow contract (EVM) / program id (Solana) — the approve /
   *  permit SPENDER for client-side ERC-20 flows (allowance screen, permit). */
  escrow_address: string
  /**
   * Whether THIS deployment can fund an escrow here on the caller's behalf —
   * the x402 one-shot (`POST /v1/agent/tasks`) and `POST /v1/escrows/:id/fund`.
   * True iff the server holds a relayer key for the chain (#132). A chain can
   * be listed and settle perfectly well for a caller signing its own gas while
   * this is false; the one-shot answers 503 RELAY_UNAVAILABLE there. An agent
   * must read this before choosing `chain_id`, never discover it from the 503.
   */
  relayed_funding_available: boolean
  /**
   * The poster's review window on THIS chain, in seconds, read live from the
   * contract (`TendaEscrow.approvalWindowSeconds`, Solana `platform_state`)
   * and cached briefly by the server (#148). Once proof lands the worker may
   * claim the payment this long afterwards with no poster involved — the
   * escrow's own `approval_deadline` is the instant for a given gig; this is
   * the number a surface with no escrow in hand may state. Differs per chain
   * (Celo mainnet 24h, the testnets 48h) and changes only through the
   * multisig `setApprovalWindow`, never through anything in this repo.
   */
  approval_window_seconds: number
  /**
   * Public, read-only JSON-RPC endpoint for the chain — the manifest's
   * `publicRpcUrl`, never the server's keyed endpoint. Null where a client
   * derives it itself (Solana clusters).
   */
  rpc_url: string | null
  /** Block-explorer base URL, or null where the manifest records none. */
  explorer_url: string | null
  /**
   * Where a caller obtains this chain's TEST USDC, or null: on every mainnet,
   * and on a testnet whose gig token is the repo's own mock (#137) — there
   * `mint()` is open and callable by anyone, at the asset's `token_address`.
   * The manifest guarantees the split: a testnet gig asset carries a faucet
   * OR is declared `openMint` (#139), never neither.
   */
  faucet_url: string | null
  assets: Array<{
    id: string
    symbol: string
    decimals: number
    is_stable: boolean
    /** On-chain SPL mint / ERC-20 contract, or null for the native gas token.
     *  Single source for client-side balance reads (mobile wallet screen). */
    token_address: string | null
    /** EIP-2612: the escrow's *WithPermit entry points work for this asset.
     *  Capability only — the domain version stays server-side. */
    supports_permit: boolean
    /**
     * This asset can fund an escrow BY SIGNATURE on this chain — the one-shot
     * `POST /v1/agent/tasks` path (#146). EVM: the token carries EIP-3009 under
     * its permit domain (declared; the relay still probes the live token).
     * Solana: every asset, the creator signs the whole transaction. False =
     * that route answers 422 RELAY_UNSUPPORTED_ASSET for it. Derived from the
     * SAME predicate the relay refuses with, `assetFundsBySignature`.
     */
    funds_by_signature: boolean
    /**
     * What this asset may be used for HERE — the answer the escrow validators
     * will actually give. Listing an asset is not the same as accepting it:
     * gigs take exactly ONE asset per chain and the exchange takes a set, so a
     * client that picked any listed asset for a gig got a 422 it could not have
     * predicted from this response. Derived from `gigAssetByChain` /
     * `exchangeAssetsByChain`, the same functions `assertGigAsset` and
     * `assertExchangeAsset` refuse with, so it cannot promise what they reject.
     */
    roles: AssetRole[]
  }>
}

export interface PlatformContract {
  config:        Endpoint<'GET', undefined, undefined, undefined, PlatformConfig>
  exchangeRates: Endpoint<'GET', undefined, undefined, undefined, ExchangeRates>
  chains:        Endpoint<'GET', undefined, undefined, undefined, { data: ChainRegistryEntry[] }>
}
