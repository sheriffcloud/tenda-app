import { DetailEmpty } from '@/components/app/workspace/detail'
import { NOTIFICATIONS_LIST_COPY } from '@/components/notifications/copy'

/**
 * /notifications with nothing open. The feed moved to the @list slot; at
 * ≤900px this route renders only that list, so a phone still sees the centre
 * as a page.
 */
export default function NotificationsPage() {
  return (
    <DetailEmpty
      title={NOTIFICATIONS_LIST_COPY.emptyDetailTitle}
      body={NOTIFICATIONS_LIST_COPY.emptyDetailBody}
    />
  )
}
