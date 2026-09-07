import { MessagesListColumn } from '@/components/chat/MessagesListColumn'

/**
 * The @list slot for /chat/[userId] — the SAME inbox the /messages surface
 * shows.
 *
 * A thread lives at /chat/<userId> rather than /messages/<userId>, so it is a
 * different surface as far as the slot router is concerned and needs its own
 * entry; without it, opening a thread would drop the list Next had just
 * rendered and collapse the workspace to two panes mid-navigation.
 */
export default function ChatListSlot() {
  return <MessagesListColumn />
}
