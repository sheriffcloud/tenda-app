'use client'

/**
 * MY gigs, recent (#60, correction d): the My Gigs tabs — Posted / Working /
 * Applied, `MY_GIGS_TABS` — plus Drafts, each the first few rows of the list
 * `useMyGigs` already holds for the column. Never the open feed: that is
 * /gigs. Rows are `GigSummary`: title · place · chain · status · amount — no
 * worker names, no applicant counts (neither is on the list wire).
 */
import { useState } from 'react'
import { formatAssetAmount, type GigSummary, type MyApplication } from '@tenda/shared'
import { GigStatusBadge } from '@/components/escrow/StatusBadge'
import { MY_GIGS_COPY, MY_GIGS_TABS, myGigHref, myGigsHref, type MyGigsTab } from '@/components/gig/my-gigs/copy'
import { GigRowSubtitle } from '@/components/gig/my-gigs/row-subtitle'
import type { MyGigsState } from '@/hooks/gig/useMyGigs'
import { pillToggleClass } from '@/components/ui/pill-toggle'
import { HOME_COPY } from './copy'
import { DashCard, DashEmpty, DashRow, DashRows } from './primitives'

/** How many rows a card shows before "All my gigs". */
export const MY_GIGS_RECENT = 4

type CardTab = MyGigsTab | 'drafts'

const TABS: readonly { key: CardTab; label: string }[] = [
  ...MY_GIGS_TABS,
  { key: 'drafts', label: HOME_COPY.myGigs.drafts },
]

function rowsFor(tab: CardTab, lists: MyGigsState): { gigs: GigSummary[]; href: (gig: GigSummary) => string } {
  if (tab === 'applications') {
    return {
      gigs: lists.applications.items.map((row: MyApplication) => row.gig),
      href: (gig) => myGigHref(gig.escrow_id, 'applications', null),
    }
  }
  const list = tab === 'drafts' ? lists.drafts : tab === 'working' ? lists.working : lists.posted
  return {
    gigs: list.items,
    href: (gig) => (tab === 'drafts' ? `/my-gigs/${gig.escrow_id}` : myGigHref(gig.escrow_id, tab, null)),
  }
}

function countFor(tab: CardTab, lists: MyGigsState): number | undefined {
  const list = tab === 'drafts' ? lists.drafts : tab === 'working' ? lists.working : tab === 'applications' ? lists.applications : lists.posted
  return list.hasFetched ? list.total : undefined
}

function emptyFor(tab: CardTab): string {
  return tab === 'drafts' ? HOME_COPY.myGigs.empty : MY_GIGS_COPY.surface(tab).emptyTitle
}

export function MyGigsCard({ lists }: { lists: MyGigsState }) {
  const [tab, setTab] = useState<CardTab>('posted')
  const { gigs, href } = rowsFor(tab, lists)
  const recent = gigs.slice(0, MY_GIGS_RECENT)
  const allHref = tab === 'drafts' ? MY_GIGS_COPY.draftsHref : myGigsHref(tab, null)

  return (
    <DashCard
      title={HOME_COPY.myGigs.title}
      pill={<span className="type-caption text-content-tertiary">{HOME_COPY.myGigs.recent}</span>}
      more={{ href: allHref, label: HOME_COPY.myGigs.all }}
    >
      <div role="tablist" aria-label={HOME_COPY.myGigs.title} className="mt-3.5 flex flex-wrap gap-1.5">
        {TABS.map(({ key, label }) => {
          const count = countFor(key, lists)
          const selected = tab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(key)}
              className={pillToggleClass(selected)}
            >
              {label}
              {count !== undefined && <span className="font-numeric">· {count}</span>}
            </button>
          )
        })}
      </div>

      {recent.length === 0 ? (
        <DashEmpty>{emptyFor(tab)}</DashEmpty>
      ) : (
        <DashRows>
          {recent.map((gig) => (
            <DashRow
              key={gig.escrow_id}
              href={href(gig)}
              title={gig.title}
              subtitle={<GigRowSubtitle gig={gig} />}
              badge={<GigStatusBadge status={gig.status} />}
              trailing={formatAssetAmount(gig.amount_raw, gig.asset)}
              muted={gig.status === 'completed' || gig.status === 'draft'}
            />
          ))}
        </DashRows>
      )}
    </DashCard>
  )
}
