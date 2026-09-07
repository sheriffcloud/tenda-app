/**
 * The three lists My Gigs holds, and the narrowing of the `?mine=` that
 * selects one.
 *
 * Its own module so `copy.ts` and the column can both import it without a
 * cycle — the copy builds the hrefs, the column reads the tab out of them.
 *
 * The comp draws TWO tabs (Posted, Working). "Applied" is the third because
 * mobile has it and behaviour wins over the comps: an applicant with no
 * accepted gig would otherwise have nowhere to see what they are waiting on.
 */
export type MyGigsTab = 'posted' | 'working' | 'applications'

export const MY_GIGS_TABS: readonly { key: MyGigsTab; label: string }[] = [
  { key: 'posted', label: 'Posted' },
  { key: 'working', label: 'Working' },
  { key: 'applications', label: 'Applied' },
]

/** A `?mine=` value narrowed to a real tab; anything else is the default. */
export function myGigsTab(raw: string | null): MyGigsTab {
  return MY_GIGS_TABS.find((tab) => tab.key === raw)?.key ?? 'posted'
}
