/**
 * The wallet's action row (Tier-3 comp, line 664-666) minus its first button.
 *
 * The comp leads with "Buy USDC". Onramp was retired in #61, so the row starts
 * at Sell — and there is deliberately no disabled Buy button standing in for
 * it: a control that cannot ever work is worse than a row that never claimed
 * to have one.
 */
import Link from 'next/link'
import { ArrowLeftRight, Banknote } from 'lucide-react'
import { buttonVariants } from '@/components/ui/Button'
import { WALLET_COPY } from './copy'

export function WalletActions() {
  return (
    <div className="flex flex-wrap gap-2.5">
      <Link href="/wallet/buy-sell" className={buttonVariants({ variant: 'primary', size: 'md' })}>
        <Banknote size={16} aria-hidden /> {WALLET_COPY.sell}
      </Link>
      <Link href="/exchange" className={buttonVariants({ variant: 'outline', size: 'md' })}>
        <ArrowLeftRight size={16} aria-hidden /> {WALLET_COPY.offers}
      </Link>
    </div>
  )
}
