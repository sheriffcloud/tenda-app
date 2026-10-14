/**
 * A pinned, informational broadcast banner. No PER-CARD read state: the whole
 * pinned set is cleared at once by mark-all-read, which advances the viewer's
 * `announcements_read_at` cursor, and the server then stops serving them. So
 * the card never renders a read/unread distinction — everything it is handed
 * is unread by construction.
 *
 * Web twin of mobile's AnnouncementCard.
 */
import { Megaphone } from 'lucide-react'
import type { AnnouncementWire } from '@tenda/shared'

export function AnnouncementCard({ announcement }: { announcement: AnnouncementWire }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-border-subtle bg-surface-inset p-4">
      <div className="flex items-center gap-1.5">
        <Megaphone size={16} className="shrink-0 text-brand-primary" />
        <p className="line-clamp-2 flex-1 text-[14.5px] font-semibold text-content-primary">
          {announcement.title}
        </p>
      </div>
      <p className="text-[13.5px] leading-[19px] text-content-secondary">{announcement.body}</p>
    </div>
  )
}
