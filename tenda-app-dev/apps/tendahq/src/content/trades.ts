/**
 * Example P2P exchange corridors surfaced by the product sheet — each row is one
 * "crypto → local cash" movement: the asset side (what's locked in escrow, on
 * which chain) and the fiat side (what the counterparty receives, over which
 * payout rail).
 *
 * THREE RULES, each learned the hard way:
 *
 *   1. Only currencies an offer can actually be denominated in may appear —
 *      the payout registry's. These rows read as product screenshots, so a row
 *      in a currency outside the registry is a promise the Exchange will refuse
 *      the moment someone tries it. The registry is the authority and
 *      `markets.test.ts` enforces it; this rule names no currencies, because
 *      the version that did said "i.e. NGN, KES and GHS" and called a ZAR or
 *      PHP row a broken promise — which became the exact opposite of the truth
 *      when South Africa, the Philippines and the UAE shipped.
 *   2. Rails stay GENERIC — "Bank transfer", "Mobile money". Tenda integrates
 *      no payment provider: it stores the account details a user types in and
 *      the two parties settle between themselves. Naming M-Pesa, OPay, GCash,
 *      Wise or SEPA implies an integration that does not exist, and only some
 *      markets declare a mobile-money rail at all — read the specs, do not
 *      assume.
 *   3. FIAT AMOUNTS ARE ROUNDED, to at most two significant figures, and the
 *      card prefixes them with "≈". These rows divide out to an exchange rate
 *      — 120 USDC for 187,200 NGN was publishing 1,560 NGN/USDC — and a
 *      precise-looking number on a marketplace page reads as the rate you will
 *      get. It is not: the seller prices their own offer, Tenda takes no
 *      spread, and this file has no live source, so the implied rate ages with
 *      the naira and nothing here notices. Rounding removes the false
 *      precision; `markets.test.ts` keeps it removed.
 *
 *      THE RATE LEVEL WAS DELIBERATELY NOT CHANGED. Rounding is not a refresh:
 *      the implied rates still sit roughly where they were, because nothing in
 *      this repo can verify today's true rate. Treat the levels as marketing
 *      copy that someone owns refreshing, and the roundness as the guard that
 *      stops them being read as a quote in the meantime.
 *
 * EDIT THIS FILE to add or change showcased corridors, within those rules.
 */

import type { CurrencyCode } from './currencies'

export type TradeAssetSymbol = 'USDC' | 'SOL' | 'ETH' | '0G'

/** The only rail labels that describe what actually happens. */
export type TradeRail = 'Bank transfer' | 'Mobile money'

export interface ExampleTrade {
  id: string
  /** What's locked in escrow. */
  asset: {
    symbol: TradeAssetSymbol
    /** Display amount, pre-formatted (kept as string for exact rendering). */
    amount: string
    /** Manifest family of the chain the asset moves on. */
    chainFamily: '0g' | 'solana' | 'base' | 'celo'
  }
  /** What the counterparty receives. */
  fiat: {
    /**
     * Must be a payout-registry currency — see rule 1 above, and
     * `markets.test.ts`, which checks it against PAYOUT_CURRENCIES.
     *
     * Typed as the display vocabulary rather than a hand-written triple. The
     * triple was `Extract<CurrencyCode, 'NGN' | 'KES' | 'GHS'>`, which had
     * silently become narrower than the registry it claimed to mirror — it
     * made a perfectly valid ZAR corridor a compile error. Registry membership
     * is a runtime fact about a hand-curated row, so the test is the right
     * place to enforce it.
     */
    currency: CurrencyCode
    amount: number
    rail: TradeRail
  }
}

export const EXAMPLE_TRADES: readonly ExampleTrade[] = [
  // 0G leads the rows (launch positioning, 2026-08-27). Implied rates sit at
  // the same levels as the sibling rows (~146 KES/USDC; the 0G row prices the
  // token near its market level the day it was added — marketing copy, rounded
  // to 2 significant figures like every other row, never a quote).
  { id: 'x-11', asset: { symbol: 'USDC', amount: '150',  chainFamily: '0g' },    fiat: { currency: 'KES', amount: 22_000,  rail: 'Bank transfer' } },
  { id: 'x-01', asset: { symbol: 'USDC', amount: '120',  chainFamily: 'solana' }, fiat: { currency: 'NGN', amount: 190_000, rail: 'Bank transfer' } },
  { id: 'x-02', asset: { symbol: 'SOL',  amount: '0.80', chainFamily: 'solana' }, fiat: { currency: 'KES', amount: 18_000,  rail: 'Bank transfer' } },
  { id: 'x-03', asset: { symbol: 'USDC', amount: '250',  chainFamily: 'celo' },   fiat: { currency: 'GHS', amount: 4_000,   rail: 'Mobile money' } },
  { id: 'x-04', asset: { symbol: 'ETH',  amount: '0.15', chainFamily: 'base' },   fiat: { currency: 'NGN', amount: 670_000, rail: 'Bank transfer' } },
  { id: 'x-05', asset: { symbol: 'USDC', amount: '400',  chainFamily: 'base' },   fiat: { currency: 'GHS', amount: 6_300,   rail: 'Bank transfer' } },
  { id: 'x-06', asset: { symbol: 'USDC', amount: '75',   chainFamily: 'solana' }, fiat: { currency: 'KES', amount: 11_000,  rail: 'Bank transfer' } },
  { id: 'x-12', asset: { symbol: '0G',   amount: '600',  chainFamily: '0g' },    fiat: { currency: 'NGN', amount: 150_000, rail: 'Bank transfer' } },
  { id: 'x-07', asset: { symbol: 'ETH',  amount: '0.25', chainFamily: 'base' },   fiat: { currency: 'GHS', amount: 11_000,  rail: 'Mobile money' } },
  { id: 'x-08', asset: { symbol: 'USDC', amount: '300',  chainFamily: 'celo' },   fiat: { currency: 'NGN', amount: 470_000, rail: 'Bank transfer' } },
  { id: 'x-09', asset: { symbol: 'SOL',  amount: '2.00', chainFamily: 'solana' }, fiat: { currency: 'NGN', amount: 490_000, rail: 'Bank transfer' } },
  { id: 'x-10', asset: { symbol: 'USDC', amount: '90',   chainFamily: 'solana' }, fiat: { currency: 'KES', amount: 13_000,  rail: 'Bank transfer' } },
] as const
