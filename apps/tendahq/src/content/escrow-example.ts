/**
 * The one example escrow the page draws twice — on the hero's receipt and on
 * the phone's escrow screen in §00 — so both surfaces read the same figures
 * from one place.
 *
 * NOT ONE FIGURE IS TYPED. Amounts come from `FEE_EXAMPLE`, which computes
 * them from the platform-fee default and the gig asset's own decimals, so
 * neither drawing can drift from the fee quoted further down the page. The
 * two surfaces used to derive these rows separately, in the same words, and
 * that is exactly the shape a future edit turns into two different receipts.
 *
 * THE CUSTODY LINE NAMES NO CHAIN. An earlier version named the first live
 * chain, which reads as the ONLY one the day a second mainnet goes live —
 * "held by the contract on 0G" is a sentence a Celo deploy silently makes
 * wrong. Which contracts are live is the ecosystems panels' job, read from
 * the manifest per chain.
 */

import { money2 } from '@/lib/money'
import { FEE_EXAMPLE, FEE_PCT, GIG_ASSET_SYMBOL } from './fees'

export const EXAMPLE_ESCROW = {
  /** The escrow's state chip: the money is in, the work is under way. */
  state: 'Locked',
  /** The amount and its unit, split so the unit can sit small beside it. */
  amount: money2(FEE_EXAMPLE.lockedAmount),
  unit: GIG_ASSET_SYMBOL,
  /** Who holds the money. No chain: see the file header. */
  custody: 'Held by the escrow contract',
  /** The split the contract will make. `money` marks the payout line. */
  rows: [
    { label: 'Locked', value: `${money2(FEE_EXAMPLE.lockedAmount)} ${GIG_ASSET_SYMBOL}` },
    { label: `Fee · ${FEE_PCT}%`, value: `${FEE_EXAMPLE.feeAmount} ${GIG_ASSET_SYMBOL}` },
    { label: 'Worker receives', value: FEE_EXAMPLE.payout, money: true },
  ],
  /** The contract's four states, in order. The last one is the payout. */
  stages: ['Lock', 'Work', 'Approve', 'Release'],
} as const
