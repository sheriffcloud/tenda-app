'use client'

/**
 * The broadcast band (#60): the top-priority UNREAD announcement from the
 * notification feed the centre already reads (fan-out-on-read; the server
 * serves only unread broadcasts, so this shows nothing once the reader has
 * marked all read). One line, brand-tinted — the one tinted fill on the page,
 * because a broadcast is the one thing on it that is not the reader's own.
 */
import Link from 'next/link'
import { useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { useNotificationsStore } from '@/stores/notifications.store'
import { HOME_COPY } from './copy'

export const ANNOUNCEMENTS_HREF = '/notifications'

export function AnnouncementBanner() {
  const announcements = useNotificationsStore((s) => s.announcements)
  const feedStatus = useNotificationsStore((s) => s.feedStatus)

  // The feed is read once per session by whichever surface asks first; the
  // centre asks the same way. A settled feed is not re-fetched here.
  useEffect(() => {
    if (feedStatus === 'idle') void useNotificationsStore.getState().fetchFeed()
  }, [feedStatus])

  const top = [...announcements].sort((a, b) => b.priority - a.priority)[0]
  if (top === undefined) return null

  return (
    <div
      role="status"
      className="mt-6 flex flex-wrap items-center gap-3 rounded-md border border-brand-primary-border bg-brand-primary-surface px-4 py-3 type-body-small"
    >
      <Eyebrow as="span" tone="brand">
        {HOME_COPY.announcement.label}
      </Eyebrow>
      <span className="min-w-0 flex-1 text-content-secondary">
        <span className="font-semibold text-content-primary">{top.title}</span>
        {top.body !== '' && <> — {top.body}</>}
      </span>
      <Link
        href={ANNOUNCEMENTS_HREF}
        className="ml-auto inline-flex items-center gap-1 whitespace-nowrap type-body-small font-semibold text-content-link"
      >
        {HOME_COPY.announcement.read}
        <ArrowRight size={13} aria-hidden />
      </Link>
    </div>
  )
}
