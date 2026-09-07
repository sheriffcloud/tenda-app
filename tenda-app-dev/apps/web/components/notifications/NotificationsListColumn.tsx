'use client'

/**
 * The notification centre as the workspace's list column (Tier 2 comp, lines
 * 1348-1362): day-grouped rows, unread first-class, UNREAD announcements
 * pinned above (mark-all-read clears them — see notifications-read.ts).
 *
 * The store owns the feed — it is the same data the rail's bell badge reads,
 * and `useNotificationsRealtime` keeps it current from the layout — so this
 * column reads it and fetches only when nothing has ever been loaded. A
 * mount-fetch here would re-run on every notice the reader opens, because the
 * router remounts the @list slot each time.
 */
import { useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { groupByDay, type NotificationWire } from '@tenda/shared'
import { ListColumn } from '@/components/app/workspace/list'
import type { ListGroup } from '@/components/app/workspace/list'
import { NotificationRow } from '@/components/app/workspace/rows'
import { AnnouncementCard } from '@/components/notifications'
import { Button } from '@/components/ui/Button'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useCommandPalette } from '@/hooks/workspace/useCommandPalette'
import { NOTIFICATIONS_LIST_COPY } from './copy'

export function NotificationsListColumn() {
  const notifications = useNotificationsStore((s) => s.notifications)
  const announcements = useNotificationsStore((s) => s.announcements)
  const unread = useNotificationsStore((s) => s.unread)

  const feedStatus = useNotificationsStore((s) => s.feedStatus)
  const isFetchingFeed = useNotificationsStore((s) => s.isFetchingFeed)
  const loadingMore = useNotificationsStore((s) => s.loadingMore)
  const hasMore = useNotificationsStore((s) => s.hasMore)
  const { openPalette } = useCommandPalette()
  const params = useParams<{ notificationId?: string }>()

  // Only when nothing has ever landed. The store is shared with the badge, so
  // a second reader of it must not re-drive the fetch on every remount.
  useEffect(() => {
    if (notifications.length === 0 && !isFetchingFeed)
      void useNotificationsStore.getState().fetchFeed()
    // Deliberately mount-only: `notifications.length` in the deps would refire
    // this the moment a feed legitimately empties (mark-all on an empty page).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * The comp groups by day, and the shared walker is what chat and the wallet
   * feed already use — so "Today" means the same thing on all three.
   */
  const groups: readonly ListGroup<NotificationWire>[] = useMemo(() => {
    const walked = groupByDay(
      notifications,
      (n) => n.created_at,
      (n) => n.id,
    )
    const out: ListGroup<NotificationWire>[] = []
    for (const entry of walked) {
      if (entry.type === 'day') {
        out.push({ key: entry.key, label: entry.label, rows: [] })
        continue
      }
      // Every notice carries a timestamp (notifications.created_at is NOT NULL),
      // so the walker always opens a day header before the first item and the
      // open group is always the right date. This used to carry an extra
      // undated-notice branch to stop one being filed under "Today"; the wire
      // type said `string | null` and the column never was (#38).
      //
      // The `undefined` check below stays: `groupByDay` is a SHARED walker whose
      // signature still accepts a null iso and emits a leading item when it gets
      // one. Nothing passes it one today, but the guard is what stands between
      // that contract and a TypeError, and it costs one comparison.
      const open = out[out.length - 1]
      if (open === undefined) out.push({ key: entry.key, rows: [entry.item] })
      else open.rows = [...open.rows, entry.item]
    }
    return out.filter((group) => group.rows.length > 0)
  }, [notifications])

  return (
    <ListColumn<NotificationWire>
      copy={NOTIFICATIONS_LIST_COPY.surface}
      groups={groups}
      keyOf={(n) => n.id}
      hrefOf={(n) => `/notifications/${n.id}`}
      selectedKey={params.notificationId}
      // Reads the STATUS, not the in-flight flag: a background refresh over a
      // settled feed must not blink a skeleton over it (#48).
      isLoading={feedStatus === 'loading' && notifications.length === 0}
      // A failed feed is not an empty account. Only when there is nothing to
      // show — a failed background refresh behind rows is not worth taking the
      // rows away for.
      error={
        feedStatus === 'error' && notifications.length === 0
          ? NOTIFICATIONS_LIST_COPY.error
          : null
      }
      onRetry={() => void useNotificationsStore.getState().fetchFeed()}
      countLabel={
        notifications.length > 0
          ? NOTIFICATIONS_LIST_COPY.count(unread, notifications.length)
          : undefined
      }
      onOpenPalette={openPalette}
      pinned={
        announcements.length > 0 ? (
          <div className="mb-2 flex flex-col gap-2 px-1">
            {announcements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
              />
            ))}
          </div>
        ) : undefined
      }
      footer={
        <>
          {hasMore ? (
            <div className="px-3 pb-1">
              <Button
                variant="outline"
                size="md"
                fullWidth
                disabled={loadingMore}
                onClick={() =>
                  void useNotificationsStore.getState().fetchMore()
                }
              >
                {loadingMore
                  ? NOTIFICATIONS_LIST_COPY.loadingMore
                  : NOTIFICATIONS_LIST_COPY.loadMore}
              </Button>
            </div>
          ) : null}
          {/* The badge's own control: it belongs where the unread rows are. */}
          {unread > 0 && (
            <div className="px-3 pb-1 pt-1">
              <Button
                variant="ghost"
                size="md"
                fullWidth
                onClick={() =>
                  void useNotificationsStore.getState().markAllRead()
                }
              >
                {NOTIFICATIONS_LIST_COPY.markAllRead}
              </Button>
            </div>
          )}
        </>
      }
      renderRow={(n, { active }) => (
        <NotificationRow
          href={`/notifications/${n.id}`}
          title={n.title}
          body={n.body}
          at={n.created_at}
          unread={n.read_at === null}
          selected={active}
        />
      )}
    />
  )
}
