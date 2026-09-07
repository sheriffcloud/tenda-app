import { MyGigsListColumn } from '@/components/gig/my-gigs/MyGigsListColumn'

/**
 * The @list slot for My Gigs. One entry per depth the surface has — a slot
 * matches the whole path, so a gig (or its applicants) opened COLD would
 * otherwise render with no column beside it.
 */
export default function MyGigsListSlot() {
  return <MyGigsListColumn />
}
