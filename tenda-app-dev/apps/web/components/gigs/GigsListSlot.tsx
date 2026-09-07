'use client'

/**
 * What the `@list/gigs` slot renders (#60): the column in list view, and
 * NOTHING in grid view while no gig is open — the grid drops the column for
 * a full-pane card grid. Once a card is opened the column comes back beside
 * the detail, whatever the view, so the reader can move between gigs.
 *
 * Returning null (not a hidden column) is what lets the shell collapse: the
 * pane grid keys on `:has([data-list])` in the DOM, never on a prop.
 */
import { usePathname } from 'next/navigation'
import { useGigsView } from '@/lib/gigs/browse-view'
import { OpenGigsListColumn } from './OpenGigsListColumn'
import { GIGS_SELECTION } from './copy'

export function GigsListSlot() {
  const [view] = useGigsView()
  const pathname = usePathname()
  if (view === 'grid' && !GIGS_SELECTION.test(pathname)) return null
  return <OpenGigsListColumn />
}
