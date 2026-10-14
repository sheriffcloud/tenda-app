'use client'

/**
 * The /gigs list column — the signed-in workspace's open gigs as hairline
 * rows (#60). Data and liveness come from `useOpenGigs`, shared with the grid
 * view; this file owns only what the COLUMN looks like: the head with the
 * view toggle, the search and the category chips, and the browse row.
 */
import { usePathname } from 'next/navigation'
import type { GigSummary } from '@tenda/shared'
import { ListColumn, type ListGroup } from '@/components/app/workspace/list'
import { EscrowRow } from '@/components/app/workspace/rows'
import { GigRowSubtitle } from '@/components/gig/my-gigs/row-subtitle'
import { useOpenGigs } from '@/hooks/gig/useOpenGigs'
import { useGigsBrowseStore } from '@/stores/gigs-browse.store'
import { CategoryChips } from './CategoryChips'
import { GigsSearchField } from './GigsSearchField'
import { GigsViewToggle } from './GigsViewToggle'
import { GIGS_SELECTION, OPEN_GIGS_COPY, openGigHref } from './copy'

export function OpenGigsListColumn() {
  const pathname = usePathname()
  const category = useGigsBrowseStore((s) => s.category)
  const q = useGigsBrowseStore((s) => s.q)
  const { phase, gigs, total, retry } = useOpenGigs({ category, q })

  const selected = pathname.match(GIGS_SELECTION)?.[1]
  const groups: readonly ListGroup<GigSummary>[] = [{ key: 'open', rows: gigs }]
  return (
    <ListColumn
      copy={OPEN_GIGS_COPY.surface}
      groups={groups}
      keyOf={(gig) => gig.escrow_id}
      hrefOf={(gig) => openGigHref(gig.escrow_id)}
      selectedKey={selected}
      isLoading={phase === 'loading' && gigs.length === 0}
      // Only when there is nothing left to show. `ListColumn` renders rows
      // ONLY while `error === null`, so surfacing a failed BACKGROUND
      // revalidation here would take a good list away from the reader — and
      // the offline fallback refetches precisely when those refetches fail.
      // Same rule the notifications and my-gigs columns state.
      error={phase === 'error' && gigs.length === 0 ? OPEN_GIGS_COPY.error : null}
      onRetry={retry}
      // Whether a total is KNOWN, not whether the last attempt succeeded.
      countLabel={total !== null ? OPEN_GIGS_COPY.count(total) : undefined}
      tools={<GigsViewToggle compact />}
      filters={
        <>
          <GigsSearchField />
          <CategoryChips />
        </>
      }
      // The browse row is the mini-card: place + chain on the second line,
      // then who posted it, their rating, and the same Apply|Accept fact the
      // feed card shows — all off GigSummary, nothing invented.
      renderRow={(gig, { active }) => (
        <EscrowRow
          href={openGigHref(gig.escrow_id)}
          title={gig.title}
          status={gig.status}
          category={gig.category}
          amountRaw={gig.amount_raw}
          asset={gig.asset}
          subtitle={<GigRowSubtitle gig={gig} />}
          at={gig.created_at}
          creator={gig.creator}
          requiresApproval={gig.requires_approval}
          selected={active}
        />
      )}
    />
  )
}
