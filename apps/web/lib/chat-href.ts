/**
 * The one builder for a link into the chat thread, with or without an escrow
 * attached.
 *
 * The query contract is mobile's (`escrowId` / `escrowTitle` / `kind`) and
 * `app/(app)/chat/[userId]/page.tsx` reads exactly those three keys back. It was
 * being written out by hand at three call sites — the gig's party panel, the
 * shared PersonCard and the exchange's trader card — so renaming a key or
 * dropping the `encodeURIComponent` would have fixed two of them and left the
 * third linking to a thread with no context divider and no way to notice.
 */
export interface EscrowChatContext {
  /** The escrow the conversation is about. */
  id: string
  /** What the thread's context divider calls it. */
  title: string
  kind: 'gig' | 'exchange'
}

export function escrowChatHref(userId: string, context?: EscrowChatContext): string {
  if (context === undefined) return `/chat/${userId}`
  // `encodeURIComponent`, not `URLSearchParams`: the latter writes a space as
  // `+`, and the titles these carry are prose. Both decode the same, but the
  // link a reader copies out of the address bar should not be the odd one.
  return `/chat/${userId}?escrowId=${context.id}&escrowTitle=${encodeURIComponent(
    context.title,
  )}&kind=${context.kind}`
}
