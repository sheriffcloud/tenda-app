import { SUPPORTED_CURRENCIES } from '@/data/currencies'
import { APP_INFO, LANDING_CHAINS } from '@/content'
import type { FaqCategory } from '../types'

export const COVERAGE_CATEGORY: FaqCategory = {
  num: '05',
  slug: 'coverage',
  title: 'Coverage & access',
  caption: '1 question',
  questions: [
    {
      id: 'Q.15',
      question: 'Which chains and countries can use Tenda?',
      answer: (
        <>
          <p>
            Tenda runs the same escrow contract on {APP_INFO.chains.networksLine} — pick the
            chain your money already lives on.{' '}
            {LANDING_CHAINS.map((c) => c.name).join(', ')} each bring something different:
            Solana&apos;s sub-second settlement, Base&apos;s USDC rails, Celo&apos;s
            stablecoin-paid gas. More chains are on the way.
          </p>
          <p>
            On the geographic side, Tenda is global by default — the contracts run wherever the
            chains do. Local-fiat exchange is currently live across{' '}
            {SUPPORTED_CURRENCIES.length} corridors:{' '}
            <code className="font-mono">{SUPPORTED_CURRENCIES.join(' · ')}</code>. New corridors
            unlock as we add fiat partners and as buyers and sellers meet there.
          </p>
        </>
      ),
    },
  ],
}
