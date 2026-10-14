import { MyGigsListColumn } from '@/components/gig/my-gigs/MyGigsListColumn'

/**
 * The @list slot for /my-gigs/drafts.
 *
 * A STATIC segment needs its own entry: `[escrowId]` does not catch `drafts`,
 * so without this the column vanished the moment the reader followed the
 * "N drafts waiting to be funded" link out of its own footer.
 */
export default function DraftsListSlot() {
  return <MyGigsListColumn />
}
