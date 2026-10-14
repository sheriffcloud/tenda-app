'use client'

/**
 * The /gigs GRID view (#60): the whole pane as a card grid, with the same
 * toolbar the column head carries — title, count, search, category chips and
 * the view toggle. Same data, same liveness, same filters as the column
 * (`useOpenGigs` + the browse store); only the density differs. A card opens
 * `/gigs/[id]`, where the column returns beside the detail.
 */
import { RotateCw, SearchX } from 'lucide-react'
import { FULL_PANE_CLASS } from '@/components/app/workspace/WorkspacePage'
import { GigCard } from '@/components/gig/feed/GigCard'
import { FeedSkeleton, feedListClass } from '@/components/gig/feed/FeedStates'
import { ALERT_ACTION_CLASS, AlertPanel } from '@/components/ui/AlertPanel'
import { EmptyPanel } from '@/components/ui/EmptyPanel'
import { useOpenGigs } from '@/hooks/gig/useOpenGigs'
import { useGigsBrowseStore } from '@/stores/gigs-browse.store'
import { cn } from '@/lib/cn'
import { CategoryChips } from './CategoryChips'
import { GigsSearchField } from './GigsSearchField'
import { GigsViewToggle } from './GigsViewToggle'
import { OPEN_GIGS_COPY, openGigHref } from './copy'

export function OpenGigsGrid() {
  const category = useGigsBrowseStore((s) => s.category)
  const q = useGigsBrowseStore((s) => s.q)
  const { phase, gigs, total, retry } = useOpenGigs({ category, q })
  const showSkeleton = phase === 'loading' && gigs.length === 0
  const showError = phase === 'error' && gigs.length === 0
  const showEmpty = phase === 'ready' && gigs.length === 0

  return (
    <section
      data-gigs-grid
      aria-labelledby="open-gigs-grid-title"
      className={cn(FULL_PANE_CLASS, 'pt-6')}
    >
      <div className="mb-[18px] flex flex-wrap items-center gap-3 border-b border-border-default pb-[18px]">
        <h1
          id="open-gigs-grid-title"
          className="font-display text-lg font-semibold leading-6 text-content-primary"
        >
          {OPEN_GIGS_COPY.surface.title}
        </h1>
        {total !== null && (
          <span className="font-numeric text-xs leading-4 text-content-tertiary">
            {OPEN_GIGS_COPY.count(total)}
          </span>
        )}
        <GigsSearchField className="w-full sm:w-[300px]" />
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <CategoryChips />
          <GigsViewToggle compact />
        </div>
      </div>

      {showSkeleton && <FeedSkeleton />}
      {showError && (
        <AlertPanel
          title={OPEN_GIGS_COPY.error}
          body={OPEN_GIGS_COPY.errorBody}
          action={
            <button type="button" onClick={retry} className={ALERT_ACTION_CLASS}>
              <RotateCw size={16} aria-hidden />
              {OPEN_GIGS_COPY.retry}
            </button>
          }
        />
      )}
      {showEmpty && (
        <EmptyPanel
          icon={<SearchX size={28} />}
          title={OPEN_GIGS_COPY.surface.emptyTitle}
          body={OPEN_GIGS_COPY.surface.emptyBody}
        />
      )}
      {gigs.length > 0 && (
        <ul className={feedListClass('grid')}>
          {gigs.map((gig, index) => (
            <li key={gig.escrow_id} className="flex">
              <GigCard gig={gig} index={index} href={openGigHref(gig.escrow_id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
