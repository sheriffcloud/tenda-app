'use client'

/**
 * Quick links (#60): the four places a reader goes from home, each with the
 * one live fact that belongs on it — how many fiat markets the exchange
 * serves (the payout registry), how many disputes are open (the caller's
 * own), the reader's score and review count.
 */
import Link from 'next/link'
import { ArrowLeftRight, Plus, Scale, User, type LucideIcon } from 'lucide-react'
import { formatReviewScore } from '@tenda/shared'
import { payoutMarketNames } from '@/lib/markets'
import { HOME_COPY } from './copy'
import { HOME_ACTION_HREF } from './DashboardHeader'

export const QUICK_HREF = {
  post: HOME_ACTION_HREF.post,
  trade: HOME_ACTION_HREF.trade,
  disputes: '/disputes',
  profile: '/profile',
} as const

function QuickLink({ href, icon: Icon, title, hint }: { href: string; icon: LucideIcon; title: string; hint: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3.5 rounded-md border border-border-default px-[18px] py-4 transition-colors hover:border-border-strong hover:bg-surface-card"
    >
      <Icon size={20} aria-hidden className="text-content-secondary" strokeWidth={1.75} />
      <span>
        <span className="block text-base font-semibold leading-[22px] text-content-primary">{title}</span>
        <span className="block type-body-small text-content-tertiary">{hint}</span>
      </span>
    </Link>
  )
}

export function QuickLinks({
  openDisputes,
  reviewScore,
  reviews,
}: {
  /** null until the count has answered. */
  openDisputes: number | null
  reviewScore: string | null
  /** null until the profile stats have answered — never a 0 beside a score. */
  reviews: number | null
}) {
  const markets = payoutMarketNames().length
  return (
    <nav aria-label="Quick links" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <QuickLink href={QUICK_HREF.post} icon={Plus} title={HOME_COPY.quick.post.title} hint={HOME_COPY.quick.post.hint} />
      <QuickLink
        href={QUICK_HREF.trade}
        icon={ArrowLeftRight}
        title={HOME_COPY.quick.trade.title}
        hint={HOME_COPY.quick.trade.hint(markets)}
      />
      <QuickLink
        href={QUICK_HREF.disputes}
        icon={Scale}
        title={HOME_COPY.quick.disputes.title}
        hint={
          openDisputes === null
            ? ''
            : openDisputes === 0
              ? HOME_COPY.quick.disputes.none
              : HOME_COPY.quick.disputes.open(openDisputes)
        }
      />
      <QuickLink
        href={QUICK_HREF.profile}
        icon={User}
        title={HOME_COPY.quick.profile.title}
        hint={HOME_COPY.quick.profile.hint(formatReviewScore(reviewScore), reviews)}
      />
    </nav>
  )
}
