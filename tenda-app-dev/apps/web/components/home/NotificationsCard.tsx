'use client'

/**
 * Notifications (#60): the unread count and the latest few personal notices
 * from the store the bell already reads — nothing is fetched here that the
 * shell does not fetch anyway. A row opens the notice in the centre.
 */
import { useNotificationsStore } from '@/stores/notifications.store'
import { RelativeTime } from '@/components/ui/RelativeTime'
import { cn } from '@/lib/cn'
import { HOME_COPY } from './copy'
import { DashCard, DashEmpty, DashPill, DashRow, DashRows } from './primitives'

export const NOTIFICATIONS_HREF = '/notifications'
/** How many notices the card shows before "All →". */
export const NOTIFICATIONS_RECENT = 4

export function NotificationsCard() {
  const notifications = useNotificationsStore((s) => s.notifications)
  const unread = useNotificationsStore((s) => s.unread)
  const recent = notifications.slice(0, NOTIFICATIONS_RECENT)
  return (
    <DashCard
      title={HOME_COPY.notifications.title}
      pill={<DashPill dot={unread > 0 ? 'brand' : 'quiet'}>{HOME_COPY.notifications.unread(unread)}</DashPill>}
      more={{ href: NOTIFICATIONS_HREF, label: HOME_COPY.notifications.all }}
    >
      {recent.length === 0 ? (
        <DashEmpty>{HOME_COPY.notifications.empty}</DashEmpty>
      ) : (
        <DashRows>
          {recent.map((notice) => {
            const isUnread = notice.read_at === null
            return (
              <DashRow
                key={notice.id}
                href={`${NOTIFICATIONS_HREF}/${notice.id}`}
                lead={
                  <span
                    aria-hidden
                    className={cn('size-2 shrink-0 rounded-full', isUnread ? 'bg-brand-primary' : 'bg-border-strong')}
                  />
                }
                title={notice.title}
                subtitle={notice.body}
                trailing={<RelativeTime iso={notice.created_at} />}
                muted={!isUnread}
              />
            )
          })}
        </DashRows>
      )}
    </DashCard>
  )
}
