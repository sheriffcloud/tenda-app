import type { Endpoint } from '../endpoint'
import type { SupportedCurrency } from '../../constants'

export interface PlatformConfig {
  fee_bps: number
  seeker_fee_bps: number
  /** Poster review window after a worker submits proof, in seconds. */
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
