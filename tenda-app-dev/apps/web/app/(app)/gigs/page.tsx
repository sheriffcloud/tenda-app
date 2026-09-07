'use client'

/**
 * /gigs with nothing selected: the card GRID when that is the reader's view,
 * otherwise the nothing-selected pane beside the list column (#60).
 */
import { DetailEmpty } from '@/components/app/workspace'
import { OPEN_GIGS_COPY, OpenGigsGrid } from '@/components/gigs'
import { useGigsView } from '@/lib/gigs/browse-view'

export default function GigsPage() {
  const [view] = useGigsView()
  if (view === 'grid') return <OpenGigsGrid />
  return <DetailEmpty title={OPEN_GIGS_COPY.emptyDetailTitle} body={OPEN_GIGS_COPY.emptyDetailBody} />
}
