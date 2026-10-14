import { DetailEmpty } from '@/components/app/workspace/detail'
import { DISPUTES_LIST_COPY } from '@/components/dispute/copy'

/**
 * /disputes with nothing open.
 *
 * The list moved to the @list slot (#16), so what is left here is the detail
 * pane's empty state — and at ≤900px this route renders the LIST alone, which
 * is why a phone still sees "My disputes" as a page rather than a blank pane.
 */
export default function MyDisputesPage() {
  return (
    <DetailEmpty
      title={DISPUTES_LIST_COPY.emptyDetailTitle}
      body={DISPUTES_LIST_COPY.emptyDetailBody}
    />
  )
}
