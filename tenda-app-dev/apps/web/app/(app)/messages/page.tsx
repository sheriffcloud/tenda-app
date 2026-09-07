import { DetailEmpty } from '@/components/app/workspace/detail'
import { MESSAGES_LIST_COPY } from '@/components/chat/copy'

/**
 * /messages with nothing open.
 *
 * The inbox itself moved to the @list slot, which is what the comps draw: the
 * list is a column beside the detail, not a page that gets replaced by one.
 * What is left here is the pane's empty state — and at ≤900px this route
 * renders only the list, because `data-nodetail` hides the detail whenever a
 * list exists and nothing is selected. So on a phone /messages IS the inbox,
 * and on a desktop it is the inbox plus an invitation.
 */
export default function MessagesPage() {
  return (
    <DetailEmpty
      title={MESSAGES_LIST_COPY.emptyDetailTitle}
      body={MESSAGES_LIST_COPY.emptyDetailBody}
    />
  )
}
