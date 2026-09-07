'use client'

/**
 * Messages (#60): the inbox's unread total and its latest threads, off the
 * chat store the workspace layout keeps live — the same rows the Messages
 * column lists, at the same address (`/chat/<other user>`).
 */
import { displayName } from '@tenda/shared'
import { Avatar } from '@/components/ui/Avatar'
import { RelativeTime } from '@/components/ui/RelativeTime'
import { useChatStore } from '@/stores/chat.store'
import { HOME_COPY } from './copy'
import { DashCard, DashEmpty, DashPill, DashRow, DashRows } from './primitives'

export const INBOX_HREF = '/messages'
/** How many threads the card shows before "Inbox →". */
export const MESSAGES_RECENT = 3

export function MessagesCard() {
  const conversations = useChatStore((s) => s.conversations)
  const unread = useChatStore((s) => s.unread)
  const recent = [...conversations]
    .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at))
    .slice(0, MESSAGES_RECENT)
  return (
    <DashCard
      title={HOME_COPY.messages.title}
      pill={<DashPill dot={unread > 0 ? 'brand' : 'quiet'}>{HOME_COPY.messages.unread(unread)}</DashPill>}
      more={{ href: INBOX_HREF, label: HOME_COPY.messages.inbox }}
    >
      {recent.length === 0 ? (
        <DashEmpty>{HOME_COPY.messages.empty}</DashEmpty>
      ) : (
        <DashRows>
          {recent.map((thread) => {
            const name = displayName(thread.other_user.first_name, thread.other_user.last_name, thread.other_user.id)
            return (
              <DashRow
                key={thread.id}
                href={`/chat/${thread.other_user.id}`}
                lead={<Avatar size="sm" name={name} src={thread.other_user.avatar_url} />}
                title={name}
                subtitle={thread.last_message ?? undefined}
                trailing={<RelativeTime iso={thread.last_message_at ?? thread.created_at} />}
                muted={thread.unread_count === 0}
              />
            )
          })}
        </DashRows>
      )}
    </DashCard>
  )
}
