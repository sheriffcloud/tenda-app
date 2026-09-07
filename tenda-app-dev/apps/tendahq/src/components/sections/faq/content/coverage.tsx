import {
  APP_INFO,
  CHAIN_STRENGTHS_PROSE,
  DISPLAY_CURRENCY_COUNT,
  MAINNET_STATUS_CLAUSE,
  TRADE_COUNTRIES_PROSE,
  TRADE_CURRENCIES_PROSE,
  SUPPORTED_CURRENCIES,
  TRADE_MARKET_COUNT,
} from '@/content'
import type { FaqCategory } from '../types'

/**
 * Q.15 — reach. Both halves are derived: chains from CHAIN_MANIFEST, markets
 * from the payout registry (see content/markets.ts for why the two currency
 * counts are NOT interchangeable).
 */
export const COVERAGE_CATEGORY: FaqCategory = {
  title: 'Coverage & access',
  questions: [
    {
      id: 'Q.15',
      question: 'Which chains and countries can use Tenda?',
      answer: (
        <>
          <p>
            One escrow contract, built for {APP_INFO.chains.networksLine} —{' '}
            {MAINNET_STATUS_CLAUSE}. Each brings something different:{' '}
            {CHAIN_STRENGTHS_PROSE}.
          </p>
          <p>
            Gig work is global by default — the contracts run wherever the chains do, and a gig
            escrowed in USDC needs nothing from your local banking system.
          </p>
          <p>
            Cashing out to local money is narrower, and worth being exact about. Exchange offers
            can be denominated in{' '}
            <code className="font-mono">{TRADE_CURRENCIES_PROSE}</code> — {TRADE_MARKET_COUNT}{' '}
            markets: {TRADE_COUNTRIES_PROSE}. Separately, you can view your balance in any of{' '}
            {DISPLAY_CURRENCY_COUNT} currencies (
            <code className="font-mono">{SUPPORTED_CURRENCIES.join(' · ')}</code>), which is a
            display setting rather than a market you can trade into. New markets open as we clear
            each one and as buyers and sellers show up there.
          </p>
        </>
      ),
    },
  ],
}
