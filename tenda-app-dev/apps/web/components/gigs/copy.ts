/**
 * The /gigs surface's strings and its one URL helper. The list's own copy is
 * what the /home column said before #60 moved browsing here — the words did
 * not change, only the address.
 */
import type { ListSurfaceCopy } from '@/components/app/workspace/list'

/** The open row's id off the pathname; null on the bare surface. */
export const GIGS_SELECTION = /^\/gigs\/([^/]+)$/

/**
 * ONE address per row. The column hands it to `ListColumn` twice — as `hrefOf`,
 * which the keyboard cursor pushes on Enter, and as the row's own `href` — and
 * the grid card takes it as its `href`; none of the three may disagree.
 */
export function openGigHref(escrowId: string): string {
  return `/gigs/${escrowId}`
}

export const OPEN_GIGS_COPY = {
  surface: {
    title: 'Open gigs',
    emptyTitle: 'No open gigs',
    emptyBody: 'New work will appear here as soon as it is posted.',
  } satisfies ListSurfaceCopy,
  /** Whether a total is KNOWN, not whether the last attempt succeeded. */
  count: (total: number) => `${total} open`,
  error: 'Could not load open gigs',
  /** The feed's own read-failure body: a READ failure, the money untouched. */
  errorBody:
    'The gig index did not respond. Nothing is wrong with your escrow or your balance — this is a read failure only.',
  retry: 'Try again',
  /** The category chips' "all" chip, and the group's accessible name. */
  allCategories: 'All',
  categoryGroup: 'Category',
  view: {
    group: 'View',
    list: 'List',
    grid: 'Grid',
  },
  /** The nothing-selected detail pane, unchanged from the /home column. */
  emptyDetailTitle: 'Choose an open gig',
  emptyDetailBody:
    'Select a gig from the list to review its brief, terms and escrow details without leaving your workspace.',
} as const
