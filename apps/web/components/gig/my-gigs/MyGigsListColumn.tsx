'use client'

/**
 * My Gigs as the workspace's list column (Tier 2 comp, lines 1280-1310).
 *
 * Mounted by `@list/my-gigs` and by every route under it, so opening a gig
 * swaps only the detail pane. Both pieces of list state — the tab and the
 * chain filter — ride the URL, because the router remounts this component on
 * every row it opens and local state would reset each time.
 *
 * All four lists load, not just the visible one: an inactive tab's count has
 * to be a real server total, never a zero for a list nobody fetched. They come
 * from account-scoped caches, so the remount every opened row causes paints
 * page zero instantly and revalidates SILENTLY — no skeleton, no count
 * flicker. (The revalidation requests still fire per mount; the caches save
 * the blink, not the round trips.)
 */
import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileClock } from 'lucide-react'
import { applicationStatusLine, type GigSummary, type MyApplication } from '@tenda/shared'
import { ListColumn } from '@/components/app/workspace/list'
import type { ListGroup } from '@/components/app/workspace/list'
import { EscrowRow } from '@/components/app/workspace/rows'
import { Button } from '@/components/ui/Button'
import { ChainFilterChips } from '@/components/shared/ChainFilterChips'
import { useMyGigs } from '@/hooks/gig/useMyGigs'
import { useNow } from '@/hooks/timing/useNow'
import { useCommandPalette } from '@/hooks/workspace/useCommandPalette'
import { useMyGigsRoute } from '@/hooks/gig/useMyGigsRoute'
import { MY_GIGS_COPY, MY_GIGS_TABS, myGigHref, myGigsHref } from './copy'
import { GigRowSubtitle } from './row-subtitle'

export function MyGigsListColumn() {
  const router = useRouter()
  const { tab, chainId, openEscrowId } = useMyGigsRoute()
  const { posted, working, drafts, applications } = useMyGigs(chainId)
  const { openPalette } = useCommandPalette()
  const nowMs = useNow()

  const list = tab === 'posted' ? posted : tab === 'working' ? working : applications

  const gigGroups: readonly ListGroup<GigSummary>[] = useMemo(
    () => [{ key: tab, rows: tab === 'working' ? working.items : posted.items }],
    [tab, posted.items, working.items],
  )
  const applicationGroups: readonly ListGroup<MyApplication>[] = useMemo(
    () => [{ key: 'applications', rows: applications.items }],
    [applications.items],
  )

  const shared = {
    isLoading: list.isLoading,
    error: list.error,
    onRetry: () => void list.reload(),
    countLabel: list.hasFetched ? MY_GIGS_COPY.count(list.total, tab) : undefined,
    onOpenPalette: openPalette,
    // ONE control for the gig tabs, as mobile has it. Applications are
    // caller-scoped with no chain parameter on the wire, so it steers Posted
    // and Working only — and it writes to the URL rather than to state,
    // because this column is remounted on every row it opens.
    //
    // `replace`, not `push`: a filter is not a place. Ten chips tapped would
    // otherwise be ten Back presses to leave the surface.
    pinned:
      tab === 'applications' ? undefined : (
        <div className="px-1">
          <ChainFilterChips
            value={chainId}
            onChange={(next) => router.replace(myGigsHref(tab, next))}
          />
        </div>
      ),
    tabs: MY_GIGS_TABS.map((entry) => ({
      href: myGigsHref(entry.key, chainId),
      label: entry.label,
      count: countFor(entry.key, posted, working, applications),
      current: entry.key === tab,
    })),
    footer: (
      <>
        {list.hasMore && (
          <div className="px-3 pb-1">
            <Button
              variant="outline"
              size="md"
              fullWidth
              disabled={list.isLoadingMore}
              onClick={() => list.loadMore()}
            >
              {list.isLoadingMore ? MY_GIGS_COPY.loadingMore : MY_GIGS_COPY.loadMore}
            </Button>
          </div>
        )}
        {/* Drafts are their own list and never rows in Posted — the count
            chip must not be inflated by pre-signature staging rows. */}
        {drafts.hasFetched && drafts.total > 0 && (
          <Link
            href={MY_GIGS_COPY.draftsHref}
            className="mx-3 mb-2 mt-1 flex items-center gap-2.5 rounded-card border border-border-subtle bg-surface-inset px-3 py-2.5 type-body-small text-content-primary transition-colors hover:border-border-strong"
          >
            <FileClock size={15} aria-hidden className="shrink-0 text-content-secondary" />
            <span className="flex-1">{MY_GIGS_COPY.drafts(drafts.total)}</span>
          </Link>
        )}
      </>
    ),
  }

  if (tab === 'applications') {
    return (
      <ListColumn<MyApplication>
        {...shared}
        copy={MY_GIGS_COPY.surface(tab)}
        groups={applicationGroups}
        keyOf={(row) => row.application.id}
        hrefOf={(row) => myGigHref(row.gig.escrow_id, tab, null)}
        selectedKey={openEscrowId ?? undefined}
        renderRow={(row, { active }) => (
          <EscrowRow
            href={myGigHref(row.gig.escrow_id, tab, null)}
            title={row.gig.title}
            status={row.gig.status}
            category={row.gig.category}
            amountRaw={row.gig.amount_raw}
            asset={row.gig.asset}
            subtitle={applicationStatusLine(row.application.status, expiresIn(row, nowMs))}
            at={row.application.created_at}
            // Who you applied TO — the applicant is deciding whether to keep
            // waiting on this poster.
            creator={row.gig.creator}
            selected={active}
          />
        )}
      />
    )
  }

  return (
    <ListColumn<GigSummary>
      {...shared}
      // A chain filter narrowing a real list to nothing is not an empty list.
      copy={MY_GIGS_COPY.surface(tab, chainId !== null)}
      groups={gigGroups}
      keyOf={(gig) => gig.escrow_id}
      hrefOf={(gig) => myGigHref(gig.escrow_id, tab, chainId)}
      selectedKey={openEscrowId ?? undefined}
      renderRow={(gig, { active }) => (
        <EscrowRow
          href={myGigHref(gig.escrow_id, tab, chainId)}
          title={gig.title}
          status={gig.status}
          category={gig.category}
          amountRaw={gig.amount_raw}
          asset={gig.asset}
          subtitle={<GigRowSubtitle gig={gig} />}
          at={gig.created_at}
          // On Working the creator is the OTHER party — worth a face. On
          // Posted it is the reader; telling someone their own name is
          // furniture, so the meta row stays off.
          creator={tab === 'working' ? gig.creator : undefined}
          selected={active}
        />
      )}
    />
  )
}

/** A tab's chip count, or undefined until its list has answered. */
function countFor(
  key: string,
  posted: { total: number; hasFetched: boolean },
  working: { total: number; hasFetched: boolean },
  applications: { total: number; hasFetched: boolean },
): number | undefined {
  const list = key === 'posted' ? posted : key === 'working' ? working : applications
  return list.hasFetched ? list.total : undefined
}

/** Seconds until an application lapses, or null when it does not. */
function expiresIn(row: MyApplication, nowMs: number): number | null {
  if (row.application.expires_at === null) return null
  return Math.floor((new Date(row.application.expires_at).getTime() - nowMs) / 1000)
}
