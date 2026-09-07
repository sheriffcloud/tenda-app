'use client'

/**
 * One notice in the centre — the #60 preview's notification row: an unread
 * dot (brand while unread, the hairline tone once read), the title carrying
 * the weight only while unread, the body as a caption, the relative time in
 * mono on the right, one hairline between rows. No icon tile and no inset
 * fill: the dot is the whole unread signal, and the row is scanned by title.
 */
import type { NotificationWire } from '@tenda/shared'
import { RelativeTime } from '@/components/ui/RelativeTime'
import { cn } from '@/lib/cn'

export function NotificationRow({
  notification,
  onPress,
}: {
  notification: NotificationWire
  onPress: () => void
}) {
  const unread = notification.read_at === null

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`${notification.title}${unread ? ', unread' : ''}`}
      className="grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-3 border-b border-border-subtle px-1 py-3 text-left transition-colors hover:bg-surface-inset"
    >
      <span
        aria-hidden
        // The test id names the UNREAD state, which is what the dot means
        // only while it is brand-coloured; a read row's dot is furniture.
        data-testid={unread ? 'notification-unread-dot' : undefined}
        className={cn('mt-1.5 size-2 rounded-full', unread ? 'bg-brand-primary' : 'bg-border-strong')}
      />

      <span className="min-w-0">
        <span
          className={cn(
            'block truncate type-body-small',
            unread ? 'font-semibold text-content-primary' : 'text-content-secondary',
          )}
        >
          {notification.title}
        </span>
        <span className="mt-0.5 line-clamp-2 block type-caption text-content-tertiary">
          {notification.body}
        </span>
      </span>

      <RelativeTime
        iso={notification.created_at}
        className="font-numeric text-xs leading-4 text-content-tertiary"
      />
    </button>
  )
}
