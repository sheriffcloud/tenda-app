'use client'

/**
 * One notification, in the detail pane (Tier 2 comp, lines 1348-1362).
 *
 * Opening it is what marks it read — the comp's row has a CTA ("Open the
 * escrow") and the read state follows the READ, not the row's click, so a
 * notice opened by keyboard or by deep link clears the badge exactly as a
 * clicked one does.
 *
 * The route it offers comes from the shared screen vocabulary through
 * `notificationRoute`; a payload naming a screen this app has no route for
 * says so rather than rendering a dead button.
 */
import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useNotificationsStore } from '@/stores/notifications.store'
import { notificationRoute } from '@/lib/notification-route'
import { buttonVariants, RelativeTime } from '@/components/ui'
import { DetailEmpty } from '@/components/app/workspace/detail'
import { NOTIFICATIONS_LIST_COPY } from '@/components/notifications/copy'

export default function NotificationDetailPage() {
  const { notificationId } = useParams<{ notificationId: string }>()
  const notification = useNotificationsStore((s) =>
    s.notifications.find((n) => n.id === notificationId),
  )
  // "Has the feed landed", asked of the STATUS — which is the only field that
  // distinguishes never-loaded from loaded-and-empty. #48 asked the in-flight
  // flag instead, and that leaves two gaps: on a deep link the pane renders in
  // the same commit as the list column, whose mount EFFECT starts the fetch, so
  // at first paint nothing is in flight and the status is still 'idle'; and a
  // feed that FAILED is not in flight either. Both painted "Pick a notification"
  // — the one claim this guard exists to avoid making. 'ready' is also true
  // through a background refresh, which is the case #48 was protecting.
  const feedStatus = useNotificationsStore((s) => s.feedStatus)
  const isUnread = notification !== undefined && notification.read_at === null

  useEffect(() => {
    if (isUnread) void useNotificationsStore.getState().markRead(notificationId)
  }, [isUnread, notificationId])

  if (notification === undefined) {
    // "Pick a notification" is a claim about what the reader has done, and on
    // a DEEP LINK they have already picked one — the feed simply has not
    // landed yet. Say nothing until it has; the empty state is the answer only
    // once the id is genuinely not among the notices this account holds.
    if (feedStatus !== 'ready') return null
    return (
      <DetailEmpty
        title={NOTIFICATIONS_LIST_COPY.emptyDetailTitle}
        body={NOTIFICATIONS_LIST_COPY.emptyDetailBody}
      />
    )
  }

  const route = notificationRoute(notification.data)

  return (
    <div
      data-notification-surface
      className="flex min-h-full items-center justify-center px-4 py-10 sm:px-8"
    >
      <article
        data-notification-card
        className="w-full max-w-md rounded-card border border-border-default bg-surface-card p-5 shadow-card sm:p-6"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary-surface text-brand-primary">
          <Bell size={17} aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold leading-7 tracking-[-0.3px] text-content-primary">
          {notification.title}
        </h1>
        <RelativeTime
          iso={notification.created_at}
          className="mt-2 block font-numeric text-xs leading-4 text-content-tertiary"
        />
        <p className="mt-5 whitespace-pre-wrap type-body text-content-secondary">
          {notification.body}
        </p>
        <div className="mt-7">
          {route === null ? (
            <p className="type-body-small text-content-tertiary">
              {NOTIFICATIONS_LIST_COPY.noRoute}
            </p>
          ) : (
            <Link href={route} className={buttonVariants({ variant: 'primary' })}>
              {NOTIFICATIONS_LIST_COPY.open}
            </Link>
          )}
        </div>
      </article>
    </div>
  )
}
