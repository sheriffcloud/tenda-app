import { MessagesListColumn } from '@/components/chat/MessagesListColumn'

/**
 * The @list slot for /messages. Adding a list to a surface is this file and
 * nothing else — see components/app/workspace/surfaces.ts.
 */
export default function MessagesListSlot() {
  return <MessagesListColumn />
}
