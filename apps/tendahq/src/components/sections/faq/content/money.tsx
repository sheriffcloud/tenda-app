import { SUPPORTED_CURRENCIES } from '@/data/currencies'
import type { FaqCategory } from '../types'

export const MONEY_CATEGORY: FaqCategory = {
  num: '02',
  slug: 'money',
  title: 'Money & fees',
  caption: '4 questions',
  questions: [
    {
      id: 'Q.06',
      question: 'What does Tenda charge?',
      answer: (
        <>
          <p>
            Posters and sellers pay a flat <strong>2.5%</strong> platform fee — taken on
            settlement, in the same on-chain transaction that pays the worker. The exact rate is
            published live at our public config and shown on every receipt.
          </p>
          <p>
            <strong>Workers and buyers pay 0%.</strong> No invoicing, no spread on the FX rate,
            no &quot;premium&quot; tier. Posters / sellers using a Solana Mobile (Seeker) device
            get a discounted rate.
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
            so the amount you earn is the amount you keep. To convert into local fiat, use the
            in-app Exchange to find a buyer for your USDC (or SOL, or ETH) in any of the{' '}
            {SUPPORTED_CURRENCIES.length} supported corridors:{' '}
            <code className="font-mono">{SUPPORTED_CURRENCIES.join(' · ')}</code>.
          </p>
          <p>
            Settlement happens off-chain via bank transfer or mobile money (M-Pesa, MoMo, OPay,
            GCash, etc.) — Tenda&apos;s contract holds the crypto until both sides confirm the
            fiat transfer.
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
          seconds on Base and Celo. There is no &quot;pending&quot; state we control.
        </p>
      ),
    },
    {
      id: 'Q.09',
      question: 'Are there minimum or maximum gig amounts?',
      answer: (
        <p>
          The contract enforces a tiny minimum (well under a cent) so the platform fee math
          doesn&apos;t round to zero. There&apos;s no upper ceiling on-chain — the practical
          ceiling is whatever you&apos;re comfortable escrowing.
        </p>
      ),
    },
  ],
}
