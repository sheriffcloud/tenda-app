import { MessagesListColumn } from '@/components/chat/MessagesListColumn'

/**
 * The @list slot for an OPEN thread, /chat/[userId].
 *
 * A slot matches the whole path, not a prefix: `@list/chat/page.tsx` answers
 * /chat and nothing deeper, so a hard load of /chat/<userId> — a deep link, a
 * reload, a shared URL — found no slot entry, fell through to @list/default
 * and rendered the thread with NO inbox beside it. Soft navigation hid it,
 * because Next keeps a slot's active subpage across one.
 */
export default function ChatThreadListSlot() {
  return <MessagesListColumn />
}
