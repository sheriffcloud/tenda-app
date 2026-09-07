'use client'

/**
 * /home (#60, correction d): a full-width dashboard of the reader's OWN
 * things, composed from the hooks and stores the other surfaces already
 * run — never the open feed, which is /gigs. Sections, top to bottom, as the
 * preview draws them: greeting and actions · announcement · needs your
 * attention · four ruled figures · my gigs + active trades | wallet +
 * notifications + messages · account health · quick links.
 *
 * CLIENT-COMPOSED on purpose (user decision, 2026-09-02): the one-call
 * overview endpoint is #61, filed to land after this shape is proven by a
 * consumer. The hooks own their caches (lib/account-state.ts), so the ~10
 * reads on mount are the same reads the columns make and empty with the
 * account. The 30-day settled chart is NOT here: it needs #61's series, and
 * a client-derived series would be a number this app invented.
 */
import { useEffect } from 'react'
import { FULL_PANE_CLASS } from '@/components/app/workspace/WorkspacePage'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/stores/auth.store'
import { useMyGigs } from '@/hooks/gig/useMyGigs'
import { useMyTrades } from '@/hooks/exchange/useMyTrades'
import { useMyDisputes } from '@/hooks/dispute/useMyDisputes'
import { usePayoutAccounts } from '@/hooks/fiat/usePayoutAccounts'
import { useProfileStats } from '@/hooks/profile/useProfileStats'
import { useMyStanding } from '@/hooks/profile/useStanding'
import { AccountHealthStrip } from './AccountHealthStrip'
import { ActiveTradesCard } from './ActiveTradesCard'
import { AnnouncementBanner } from './AnnouncementBanner'
import { AttentionRows } from './AttentionRows'
import { DashboardHeader } from './DashboardHeader'
import { MessagesCard } from './MessagesCard'
import { MyGigsCard } from './MyGigsCard'
import { NotificationsCard } from './NotificationsCard'
import { QuickLinks } from './QuickLinks'
import { RuledFigures } from './RuledFigures'
import { WalletCard } from './WalletCard'
import { attentionItems } from './attention'
import { HOME_COPY } from './copy'

export function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const wallets = useAuthStore((s) => s.wallets)
  const identities = useAuthStore((s) => s.identities)
  const identitiesStatus = useAuthStore((s) => s.identitiesStatus)
  const loadMethods = useAuthStore((s) => s.loadMethods)
  const userId = user?.id ?? ''

  const lists = useMyGigs()
  const trades = useMyTrades()
  const stats = useProfileStats(user?.id)
  const disputes = useMyDisputes('open')
  const { accounts } = usePayoutAccounts()
  const standing = useMyStanding()

  // The sign-in methods are the security page's read; the health strip only
  // needs them listed, so it asks once while nothing has (the way the
  // announcement band asks for the feed) and lets the store keep them. A
  // failed read stays pending here — the security page re-asks on its mount.
  useEffect(() => {
    if (identitiesStatus === 'idle') void loadMethods()
  }, [identitiesStatus, loadMethods])

  const attention = attentionItems({
    posted: lists.posted.items,
    working: lists.working.items,
    trades: trades.items,
    userId,
    copy: HOME_COPY.attention,
  })

  return (
    <div data-dashboard className={cn(FULL_PANE_CLASS, 'pt-9')}>
      <DashboardHeader user={user} />
      <AnnouncementBanner />
      <AttentionRows items={attention} />
      <RuledFigures stats={stats} reviewScore={user?.review_score ?? null} />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="flex flex-col gap-5">
          <MyGigsCard lists={lists} />
          <ActiveTradesCard trades={trades} userId={userId} />
        </div>
        <div className="flex flex-col gap-5">
          <WalletCard />
          <NotificationsCard />
          <MessagesCard />
        </div>
      </div>

      <AccountHealthStrip
        accounts={accounts}
        // Only a KNOWN list: the store's list is empty for every account
        // until the read answers, and the strip must not read that as none.
        identities={identitiesStatus === 'ready' ? identities : null}
        walletCount={wallets.length}
        standing={standing}
      />
      <QuickLinks
        openDisputes={disputes.hasFetched ? disputes.total : null}
        reviewScore={user?.review_score ?? null}
        // Only a READY count: `useProfileStats` zeroes the figures on its way
        // in, so "4.8 · 0 reviews" is what a loading or failed read would say.
        reviews={stats.status === 'ready' ? stats.reviews : null}
      />
    </div>
  )
}
