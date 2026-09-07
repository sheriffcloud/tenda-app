'use client'

/**
 * Drafts — the caller's unfunded staging gigs, reached from the banner at
 * the top of My Gigs (web port of mobile's drafts screen). The only
 * surface these rows are reachable from.
 *
 * Rows are the workspace `EscrowRow` since the 2026-08-24 redesign — the
 * last `MyGigCard` holdout, whose own comment admitted it showed no status.
 * The row's badge says DRAFT through the shared vocabulary, and the href is
 * the AUTHED detail: a draft has no public listing (`/gig/<id>` 404s it).
 */
import { FileClock } from 'lucide-react'
import { useDraftGigs } from '@/hooks/gig/useDraftGigs'
import { EscrowRow } from '@/components/app/workspace/rows'
import { GigRowSubtitle } from '@/components/gig/my-gigs/row-subtitle'
import { PaginatedList } from '@/components/shared/PaginatedList'

export default function DraftsPage() {
  const list = useDraftGigs()

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="px-1 pb-4 pt-6 font-display text-2xl font-bold text-content-primary">Drafts</h1>
      <PaginatedList
        list={list}
        keyOf={(gig) => gig.escrow_id}
        listLabel="Drafts"
        renderItem={(gig) => (
          <EscrowRow
            href={`/my-gigs/${gig.escrow_id}`}
            title={gig.title}
            status={gig.status}
            category={gig.category}
            amountRaw={gig.amount_raw}
            asset={gig.asset}
            subtitle={<GigRowSubtitle gig={gig} />}
            at={gig.created_at}
          />
        )}
        errorTitle="Could not load your drafts"
        empty={
          <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
            <FileClock size={40} className="text-content-secondary" />
            <p className="font-semibold text-content-primary">No drafts</p>
            <p className="text-sm text-content-secondary">Gigs you start but do not fund are kept here.</p>
          </div>
        }
      />
    </div>
  )
}
