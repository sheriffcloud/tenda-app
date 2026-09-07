import type { Endpoint } from '../endpoint'
import type { SupportedCurrency } from '../../constants'

export interface PlatformConfig {
  fee_bps: number
  seeker_fee_bps: number
  /**
   * Slack after `completion_deadline` before the creator may reclaim, in
   * seconds — the submit / reclaim / release windows are all
   * `completion_deadline + grace` (see GigCTABar). Defaults to 1 hour.
   *
   * NOT the poster's review window, which this doc used to call it. That is
   * `approval_window_seconds` (48h) and is deliberately absent from this
   * response — it is snapshotted onto each escrow as `approval_deadline` when
   * proof lands, so a client should read the escrow, not the config. The
   * mislabel is worth naming because the two differ by 47 hours and the wrong
   * one is the one on the wire.
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
  /** Deployed escrow contract (EVM) / program id (Solana) — the approve /
   *  permit SPENDER for client-side ERC-20 flows (allowance screen, permit). */
  escrow_address: string
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
  }>
}

export interface PlatformContract {
  config:        Endpoint<'GET', undefined, undefined, undefined, PlatformConfig>
  exchangeRates: Endpoint<'GET', undefined, undefined, undefined, ExchangeRates>
  chains:        Endpoint<'GET', undefined, undefined, undefined, { data: ChainRegistryEntry[] }>
}
