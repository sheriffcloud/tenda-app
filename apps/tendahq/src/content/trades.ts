/**
 * Example P2P exchange corridors surfaced by the TradeDeck — each row is one
 * "crypto → local cash" movement: the asset side (what's locked in escrow, on
 * which chain) and the fiat side (what the counterparty receives, over which
 * payout rail). EDIT THIS FILE to add or change showcased corridors. Together
 * the rows must cover every supported fiat currency and each of USDC / SOL /
 * ETH at least once.
 */

import type { CurrencyCode } from '@/data/currencies'

export type TradeAssetSymbol = 'USDC' | 'SOL' | 'ETH'

export interface ExampleTrade {
  id: string
  /** What's locked in escrow. */
  asset: {
    symbol: TradeAssetSymbol
    /** Display amount, pre-formatted (kept as string for exact rendering). */
    amount: string
    /** Manifest family of the chain the asset moves on. */
    chainFamily: 'solana' | 'base' | 'celo'
  }
  /** What the counterparty receives. */
  fiat: {
    currency: CurrencyCode
    amount: number
    /** Payout rail label, e.g. "M-Pesa", "Bank transfer". */
    rail: string
  }
  trader: string
  rating: number
}

export const EXAMPLE_TRADES: readonly ExampleTrade[] = [
  { id: 'x-01', asset: { symbol: 'USDC', amount: '120',  chainFamily: 'solana' }, fiat: { currency: 'NGN', amount: 187_200, rail: 'OPay' },            trader: '@chiamaka', rating: 4.9 },
  { id: 'x-02', asset: { symbol: 'SOL',  amount: '0.80', chainFamily: 'solana' }, fiat: { currency: 'KES', amount: 17_500,  rail: 'M-Pesa' },          trader: '@kimani',   rating: 4.95 },
  { id: 'x-03', asset: { symbol: 'USDC', amount: '250',  chainFamily: 'celo' },   fiat: { currency: 'GHS', amount: 3_950,   rail: 'MTN MoMo' },        trader: '@kwabena',  rating: 4.7 },
  { id: 'x-04', asset: { symbol: 'ETH',  amount: '0.15', chainFamily: 'base' },   fiat: { currency: 'USD', amount: 545,     rail: 'Wise' },            trader: '@noah',     rating: 4.8 },
  { id: 'x-05', asset: { symbol: 'USDC', amount: '400',  chainFamily: 'base' },   fiat: { currency: 'ZAR', amount: 7_480,   rail: 'Bank transfer' },   trader: '@thandi',   rating: 4.85 },
  { id: 'x-06', asset: { symbol: 'USDC', amount: '75',   chainFamily: 'solana' }, fiat: { currency: 'PHP', amount: 4_380,   rail: 'GCash' },           trader: '@maria',    rating: 4.9 },
  { id: 'x-07', asset: { symbol: 'ETH',  amount: '0.25', chainFamily: 'base' },   fiat: { currency: 'GBP', amount: 720,     rail: 'Faster Payments' }, trader: '@femi',     rating: 4.75 },
  { id: 'x-08', asset: { symbol: 'USDC', amount: '300',  chainFamily: 'celo' },   fiat: { currency: 'EUR', amount: 276,     rail: 'SEPA' },            trader: '@ada',      rating: 5.0 },
  { id: 'x-09', asset: { symbol: 'SOL',  amount: '2.00', chainFamily: 'solana' }, fiat: { currency: 'NGN', amount: 490_000, rail: 'Kuda' },            trader: '@yemi',     rating: 4.9 },
  { id: 'x-10', asset: { symbol: 'USDC', amount: '90',   chainFamily: 'solana' }, fiat: { currency: 'KES', amount: 11_600,  rail: 'M-Pesa' },          trader: '@maina',    rating: 4.8 },
] as const
