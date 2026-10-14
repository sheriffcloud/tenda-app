import {
  DISPLAY_CURRENCY_COUNT,
  FEE_EXAMPLE,
  TRADE_COUNTRIES_PROSE,
  TRADE_CURRENCIES_PROSE,
  SUPPORTED_CURRENCIES,
  TRADE_MARKET_COUNT,
} from '@/content'
import { FeePct } from '@/components/product/FeePct'
import type { FaqCategory } from '../types'

/**
 * Q.06–Q.09 — the money answers, checked against the settlement math.
 *
 * WHO PAYS THE FEE. The contract pays the counterparty `amount − fee`
 * (`_settleToCounterparty` / `computeNetPayout`), so the fee is deducted from
 * the WORKER's payout, not added to the poster's cost. This page previously
 * claimed the exact opposite — "workers and buyers pay 0%" — while §04's own
 * worked example showed 12 USDC in and 11.70 out. The mobile app has always
 * said it correctly ("the fee is taken from the worker's payout on
 * completion"); the landing is now the one that agrees with both.
 *
 * MARKETS vs CURRENCIES. The display currencies are a DISPLAY preference; only
 * the payout-registry currencies can denominate an offer. Both numbers are
 * derived in content/markets.ts — see the note there, and do not restate
 * either count in prose: this comment said "Eight" until AED made it nine.
 */
export const MONEY_CATEGORY: FaqCategory = {
  title: 'Money & fees',
  questions: [
    {
      id: 'Q.06',
      question: 'What does Tenda charge?',
      answer: (
        <>
          <p>
            One flat <strong><FeePct /></strong> per escrow, and nothing else — no listing fee,
            no invoicing, no spread on the FX rate, no &quot;premium&quot; tier. That figure is
            read live from our public config as you read this, and it&apos;s shown on every
            receipt.
          </p>
          <p>
            <strong>It comes out of the payout, not on top of it.</strong> Post a{' '}
            {FEE_EXAMPLE.lockedAmount} USDC gig and you lock exactly{' '}
            {FEE_EXAMPLE.lockedAmount} USDC; at settlement the contract pays{' '}
            {FEE_EXAMPLE.payoutAmount} to the worker and {FEE_EXAMPLE.feeAmount} to Tenda, in
            the same transaction. So the poster&apos;s cost is the number they posted, and the
            worker&apos;s take-home is <FeePct /> under it — which is why every gig screen
            shows both figures before anyone commits.
          </p>
          <p>
            Owners of a Solana Mobile (Seeker) device pay <strong><FeePct tier="seeker" /></strong>{' '}
            instead of <FeePct />, on every chain.
          </p>
        </>
      ),
    },
    {
      id: 'Q.07',
      question: 'Can I get paid in my local currency?',
      answer: (
        <>
          <p>
            Workers are paid in <strong>USDC</strong> on settlement — a dollar-pegged stablecoin,
            so the amount you earn is the amount you keep. To turn it into local cash, use the
            in-app Exchange to find a buyer. Offers are currently denominated in{' '}
            <code className="font-mono">{TRADE_CURRENCIES_PROSE}</code> — {TRADE_MARKET_COUNT}{' '}
            markets: {TRADE_COUNTRIES_PROSE}. More are on the way as we clear each one.
          </p>
          <p>
            Separately, you can display your balance in any of{' '}
            {DISPLAY_CURRENCY_COUNT} currencies (
            <code className="font-mono">{SUPPORTED_CURRENCIES.join(' · ')}</code>) — that&apos;s
            a display setting for reading your wallet in familiar money, not a market you can
            trade into yet.
          </p>
          <p>
            The cash itself moves directly between the two of you, over whatever rail you both
            use — a bank transfer or mobile money. <strong>Tenda never touches fiat</strong> and
            is not a payment processor: you save your own account details, you choose the rail,
            and the contract holds the crypto until the trade completes.
          </p>
        </>
      ),
    },
    {
      id: 'Q.08',
      question: 'How fast does a payout actually settle?',
      answer: (
        <p>
          From the moment the poster taps approve, the funds are in the worker&apos;s wallet
          within a block or two of the chain the gig runs on — sub-second on Solana, a few
          seconds on an L2. There is no &quot;pending&quot; state we control, because there is no
          balance for us to hold.
        </p>
      ),
    },
    {
      id: 'Q.09',
      question: 'Are there minimum or maximum gig amounts?',
      answer: (
        <p>
          The contract&apos;s floor is one base unit — a millionth of a USDC — because every
          settlement path has to move a positive amount. In practice the useful minimum is
          whatever keeps the <FeePct /> fee from rounding away to nothing. There&apos;s no
          ceiling on-chain; the practical one is whatever you&apos;re comfortable escrowing.
        </p>
      ),
    },
  ],
}
