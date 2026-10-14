import { redirect } from 'next/navigation'

/**
 * /chat with no thread id.
 *
 * The @list slot answers this URL (that is how the inbox stays put when a
 * thread opens), so without a `children` page of its own Next served a 200
 * with a list column and an empty pane beside it — a real screen for an
 * address that is not a destination. A thread is /chat/<userId>; the surface
 * that lists them is /messages, and that is where this goes.
 */
export default function ChatIndexRedirect() {
  redirect('/messages')
}
