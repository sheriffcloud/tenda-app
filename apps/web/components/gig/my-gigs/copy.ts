/**
 * The My Gigs column's strings and its URL helpers.
 *
 * Both the tab and the chain filter live in the URL, and these build every
 * link that carries them — the column, its rows and its tabs. A hand-built
 * query string anywhere else is how a filtered list snaps back to unfiltered
 * the moment the reader opens a row (the slot remounts; see CLAUDE.md).
 */
import type { MyGigsTab } from './tabs'

export { MY_GIGS_TABS, myGigsTab, type MyGigsTab } from './tabs'

/** The column's own route, carrying whichever of the two keys is not default. */
export function myGigsHref(tab: MyGigsTab, chainId: string | null): string {
  const params = new URLSearchParams()
  // 'posted' and "all chains" are the defaults, so they stay OFF the URL —
  // one view, one address.
  if (tab !== 'posted') params.set('mine', tab)
  if (chainId !== null) params.set('chain', chainId)
  const query = params.toString()
  return query === '' ? '/my-gigs' : `/my-gigs?${query}`
}

/** A row's destination: the authed dossier, with the list's state preserved. */
export function myGigHref(escrowId: string, tab: MyGigsTab, chainId: string | null): string {
  const params = new URLSearchParams()
  if (tab !== 'posted') params.set('mine', tab)
  if (chainId !== null) params.set('chain', chainId)
  const query = params.toString()
  return query === '' ? `/my-gigs/${escrowId}` : `/my-gigs/${escrowId}?${query}`
}

export const MY_GIGS_COPY = {
  title: 'My gigs',
  /** The comp's count line, which says which list the number describes. */
  count: (total: number, tab: MyGigsTab) =>
    tab === 'posted'
      ? `${total} posted by you`
      : tab === 'working'
        ? `${total} you are working`
        : `${total} applied to`,
  /**
   * The column's `ListSurfaceCopy`, per tab — the title never changes.
   *
   * `filtered` is not a nicety. "You have not posted a gig yet" is FALSE for
   * someone with three gigs on another chain, and this is the reader's OWN
   * list, so the wrong answer is obviously wrong. Same rule as
   * spec-correction #14, where the feed's empty copy denied results its own
   * query had matched.
   */
  surface: (tab: MyGigsTab, filtered = false) => ({
    title: 'My gigs',
    ...(filtered
      ? {
          emptyTitle: 'Nothing on this chain',
          emptyBody: 'Pick "All chains" to see the rest of this list.',
        }
      : tab === 'posted'
        ? {
            emptyTitle: 'You have not posted a gig yet',
            emptyBody:
              'Posting funds escrow first, then publishes. Drafts stay off-chain until you sign.',
          }
        : tab === 'working'
          ? {
              emptyTitle: 'You are not working anything yet',
              emptyBody: 'Accept a gig from Home and it appears here with its clock running.',
            }
          : {
              emptyTitle: 'No applications',
              emptyBody: 'Gigs you apply to appear here while the poster decides.',
            }),
  }),
  /** Drafts are a separate list, never rows mixed into Posted. */
  drafts: (total: number) => `${total} draft${total === 1 ? '' : 's'} waiting to be funded`,
  draftsHref: '/my-gigs/drafts',
  loadMore: 'Load more',
  loadingMore: 'Loading…',
  /** The way back from a gig that cannot be read. */
  backToList: 'Back to my gigs',
  emptyDetailTitle: 'Pick a gig',
  emptyDetailBody:
    'The escrow, its timeline and everything only the two of you can see — proofs, the counterparty, the dispute if there is one.',
} as const
