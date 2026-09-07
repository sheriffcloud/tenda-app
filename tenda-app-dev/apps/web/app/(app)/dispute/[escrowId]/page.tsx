'use client'

/**
 * CO7 dispute-mediation thread — web port of mobile's dispute screen. ONE
 * shared conversation per dispute: both parties and the mediating admin
 * read the same messages; the feed renders chronologically (mobile's
 * inverted list becomes bottom-pinned scroll). Serves TWO seats: the seat
 * comes from party membership (disputeViewerSeat) and read access grants
 * no voice — a mediator must hold the claim to post (canPost mirrors the
 * server rule). Freezes read-only once the dispute resolves.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  buildDisputeFeed,
  isDisputeDay,
  resolveDisputeSender,
  disputeViewerSeat,
  disputeSendMessage,
  type DisputeMessage,
  type DisputeSender,
} from '@tenda/shared'
import { useAuthStore } from '@/stores/auth.store'
import { DisputeContextHeader, DisputeMessageBubble } from '@/components/dispute'
import { useDisputeThread } from '@/hooks/dispute/useDisputeThread'
import { ChatInput } from '@/components/chat/ChatInput'
import { ChatTimestampGroup } from '@/components/chat/ChatTimestampGroup'
import { MediaViewerModal, type MediaItem } from '@/components/shared/media/MediaViewerModal'
import { useAttachmentUpload } from '@/hooks/uploads/useAttachmentUpload'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

function Banner({ children }: { children: string }) {
  return (
    <p className="mx-4 mt-2 rounded-[10px] bg-surface-inset p-2.5 text-xs text-content-secondary">
      {children}
    </p>
  )
}

export default function DisputeThreadPage() {
  const { escrowId } = useParams<{ escrowId: string }>()
  const myId = useAuthStore((s) => s.user?.id ?? '')
  const [viewing, setViewing] = useState<MediaItem | null>(null)

  const { loading, error, thread, messages, send, reload } = useDisputeThread(escrowId ?? null)

  const { uploading, upload } = useAttachmentUpload({
    type: 'dispute',
    scopeId: escrowId ?? null,
    onUploaded: async (attachment) => {
      const result = await send('', attachment)
      if (result !== 'sent') showToast('error', disputeSendMessage(result, 'Attachment'))
    },
  })

  // Day headers + consecutive-sender grouping. The shared builder returns
  // NEWEST-FIRST (for mobile's inverted FlatList) — web renders top→bottom,
  // so reverse back to chronological (run flags were computed pre-reversal).
  const feed = useMemo(() => buildDisputeFeed(messages).reverse(), [messages])

  // Bottom-pin on growth, matching the chat thread's reader-aware pattern.
  const listRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  useEffect(() => {
    if (pinnedRef.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [feed.length])

  /** Sender identity from the party list, NOT "whoever isn't me". */
  function senderOf(message: DisputeMessage): DisputeSender {
    const context = thread?.context ?? null
    return resolveDisputeSender({
      senderId: message.sender_id,
      viewerId: myId,
      kind: context?.kind ?? null,
      parties: context?.parties ?? [],
    })
  }

  async function handleSend(text: string) {
    const result = await send(text)
    if (result !== 'sent') showToast('error', disputeSendMessage(result, 'Message'))
  }

  const seat = disputeViewerSeat(thread?.context?.parties ?? [], myId)
  const isMediator = seat === 'mediator'
  /** Read access never implies a voice: a mediator must hold the claim to post. */
  const canPost =
    thread !== null && !thread.read_only && (!isMediator || thread.assigned_to_id === myId)

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    )
  }
  if (error !== null || thread === null) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-24 text-center">
        <p className="font-semibold text-content-primary">{error ?? 'Could not load the dispute thread'}</p>
        <Button variant="outline" onClick={() => void reload()}>Try again</Button>
      </div>
    )
  }

  return (
    // Fills its pane, like the chat thread. The old lock subtracted 57px for
    // AppShell's pinned header + border and cancelled its py-5; under the
    // workspace shell there is no header to subtract and the detail pane is
    // already height-locked by the [data-panes] grid.
    <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col">
      <h1 className="px-4 pt-4 font-display text-xl font-bold text-content-primary">
        Dispute mediation
      </h1>
      {thread.context !== null && (
        <DisputeContextHeader context={thread.context} currentUserId={myId} />
      )}
      {!thread.read_only && isMediator && !canPost && (
        <Banner>You are viewing this as a mediator. Claim this dispute in the admin dashboard to reply.</Banner>
      )}
      {!thread.read_only && !isMediator && thread.assigned_to_id === null && (
        <Banner>An admin will join this conversation shortly. You can already talk to the other party.</Banner>
      )}
      {thread.read_only && (
        <Banner>This dispute is resolved, the conversation is read-only.</Banner>
      )}

      <div
        ref={listRef}
        data-testid="dispute-message-list"
        onScroll={() => {
          const el = listRef.current
          if (el === null) return
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="flex-1 overflow-y-auto py-3"
      >
        {feed.length === 0 && (
          <p className="flex h-full items-center justify-center px-8 text-center text-xs text-content-tertiary">
            {isMediator
              ? 'No messages yet.'
              : 'No messages yet. Explain your side, the other party and the mediator see the same thread.'}
          </p>
        )}
        {feed.map((item) =>
          isDisputeDay(item) ? (
            <ChatTimestampGroup key={item._key} iso={item.iso} />
          ) : (
            <DisputeMessageBubble
              key={item.message.id}
              message={item.message}
              sender={senderOf(item.message)}
              showSender={item.showSender}
              showTime={item.showTime}
              onAttachmentPress={(a) => {
                if (a.type === 'image') setViewing({ id: a.id, url: a.url, kind: 'image' })
                else window.open(a.url, '_blank', 'noopener')
              }}
            />
          ),
        )}
      </div>

      {uploading && (
        <p className="py-1 text-center text-xs text-content-tertiary">Uploading attachment…</p>
      )}
      {canPost && (
        // No composer for a resolved thread, or for a mediator without the
        // claim — the server refuses those posts, and an input that always
        // fails is worse than none.
        <ChatInput
          onSend={(text) => void handleSend(text)}
          onAttach={(file) => void upload(file)}
          disabled={uploading}
        />
      )}

      <MediaViewerModal item={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}
