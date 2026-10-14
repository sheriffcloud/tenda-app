import { DetailEmpty } from '@/components/app/workspace/detail'
import { MY_GIGS_COPY } from '@/components/gig/my-gigs/copy'

/**
 * /my-gigs with nothing open.
 *
 * The list moved to the @list slot, so what is left is the pane's empty state
 * — and at ≤900px this route renders only the list, which is why a phone still
 * sees My Gigs as a page rather than a blank pane.
 */
export default function MyGigsPage() {
  return (
    <DetailEmpty title={MY_GIGS_COPY.emptyDetailTitle} body={MY_GIGS_COPY.emptyDetailBody} />
  )
}
