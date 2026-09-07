'use client'

/**
 * The chat thread screen — web port of mobile app/chat/[userId].tsx.
 * Feed renders chronologically with day headers + escrow-context dividers
 * (shared buildMessageFeed), pinned to the bottom on new messages.
 * Attachments ride the scoped-upload registry; image attachments open the
 * lightbox, PDFs open in a new tab (the browser is the document viewer).
 * Message reporting (mobile: long-press → ReportSheet) arrives with the
 * moderation surfaces in S6.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildMessageFeed, isDivider, isTimestamp, formatFullName } from '@tenda/shared'
import { useChatStore, type LocalMessage } from '@/stores/chat.store'
import { useAuthStore } from '@/stores/auth.store'
import { useConversation } from '@/hooks/chat/useConversation'
import { useChatRealtime } from '@/hooks/chat/useChatRealtime'
import { useAttachmentUpload } from '@/hooks/uploads/useAttachmentUpload'
import { ChatHeader } from './ChatHeader'
import { ChatInput } from './ChatInput'
import { MessageBubble } from './MessageBubble'
import { ChatContextDivider } from './ChatContextDivider'
import { ChatTimestampGroup } from './ChatTimestampGroup'
import { MediaViewerModal, type MediaItem } from '@/components/shared/media/MediaViewerModal'
import { ConfirmDialog } from '@/components/ui/overlay/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { showToast } from '@/components/ui/Toast'

export interface ChatEscrowContext {
  escrowId: string
  escrowTitle: string | null
  kind: 'gig' | 'exchange' | null
}

export function ChatThread({ userId, context }: { userId: string; context?: ChatEscrowContext }) {
  const router = useRouter()
  const myId = useAuthStore((s) => s.user?.id ?? '')
  const { sendMessage, retryMessage, closeConversation, messages } = useChatStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewing, setViewing] = useState<MediaItem | null>(null)
  const [closeConfirm, setCloseConfirm] = useState(false)
  const [closing, setClosing] = useState(false)

  const { conversationId, otherUser, loading, initError, retry } = useConversation(userId)
  useChatRealtime(conversationId)

  // Popover dismissal without an overlay layer (ModalBackdrop is for
  // dialogs): any document click or Escape closes the header menu. The
  // listener attaches AFTER the opening click's dispatch completes, so
  // opening never instantly self-closes.
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const feed = useMemo(() => {
    const msgs = conversationId ? (messages[conversationId] ?? []) : []
    return buildMessageFeed(msgs)
  }, [conversationId, messages])

  // Pin the view to the newest message when the feed grows — but ONLY while
  // the reader is already near the bottom. Mobile's inverted FlatList keeps
  // the reading position when messages arrive mid-scrollback; yanking the
  // web reader down on every incoming frame would break that parity.
  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true) // initial load always lands on the newest
  useEffect(() => {
    if (pinnedRef.current) bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [feed.length])

  const escrowContext = context ? { escrowId: context.escrowId, kind: context.kind } : undefined

  const { uploading, upload } = useAttachmentUpload({
    type: 'chat',
    scopeId: conversationId,
    onUploaded: (attachment) => {
      if (conversationId) void sendMessage(conversationId, '', escrowContext, attachment)
    },
  })

  function handleRetry(msg: LocalMessage) {
    if (!conversationId) return
    retryMessage(conversationId, msg)
  }

  async function confirmCloseConversation() {
    if (!conversationId) return
    setClosing(true)
    try {
      await closeConversation(conversationId)
      setCloseConfirm(false)
      router.push('/messages')
    } catch {
      showToast('error', 'Failed to close conversation, please try again')
    } finally {
      setClosing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner />
      </div>
    )
  }

  if (initError) {
    return (
      <div className="flex flex-1 flex-col">
        <ChatHeader name="Chat" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="font-semibold text-content-primary">Couldn&apos;t open chat</p>
          <p className="text-sm text-content-secondary">There was a problem starting this conversation.</p>
          <Button variant="outline" onClick={retry}>Retry</Button>
        </div>
      </div>
    )
  }

  const displayName = otherUser
    ? formatFullName(otherUser.first_name, otherUser.last_name) || 'Anonymous'
    : 'User'

  return (
    // Fills its pane rather than measuring the viewport. The old lock
    // subtracted 57px for AppShell's pinned header + border and cancelled its
    // py-5; under the workspace shell there is no header to subtract, and the
    // detail pane is already height-locked by the [data-panes] grid — so
    // h-full is both simpler and correct at every breakpoint. The composer
    // still never falls below the fold and the message list is still the only
    // scroller.
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative">
        {/* No back control of its own: the DETAIL PANE renders one, gated by
            CSS to ≤900px where the inbox is off-screen. Two stacked back
            affordances at the top of one pane is the kind of thing a list
            column quietly introduces. */}
        <ChatHeader
          name={displayName}
          avatarUrl={otherUser?.avatar_url}
          onMenu={() => setMenuOpen((v) => !v)}
          menuOpen={menuOpen}
        />
        {menuOpen && (
          <div className="absolute right-3 top-14 z-10 w-64 rounded-card border border-border-subtle bg-surface-card p-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setCloseConfirm(true)
              }}
              className="w-full rounded-control px-3 py-2.5 text-left transition-colors hover:bg-surface-inset"
            >
              <span className="block text-sm font-semibold text-feedback-danger-base">Close conversation</span>
              <span className="mt-0.5 block text-xs text-content-secondary">
                You&apos;ll stop seeing this thread in Messages. It reopens if either of you sends a new message.
              </span>
            </button>
          </div>
        )}
      </div>

      <div
        ref={listRef}
        data-testid="chat-message-list"
        onScroll={() => {
          const el = listRef.current
          if (el === null) return
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="flex-1 overflow-y-auto py-2"
      >
        {feed.length === 0 && (
          <p className="flex h-full items-center justify-center text-content-tertiary">
            No messages yet. Say hi!
          </p>
        )}
        {feed.map((item) => {
          if (isDivider(item)) {
            return (
              <ChatContextDivider
                key={item._key}
                escrowId={item.escrow_id}
                escrowTitle={item.escrow_title}
                kind={item.escrow_kind}
              />
            )
          }
          if (isTimestamp(item)) return <ChatTimestampGroup key={item._key} iso={item.iso} />
          return (
            <MessageBubble
              key={item.id}
              message={item}
              isMine={item.sender_id === myId}
              onRetry={item._status === 'failed' ? () => handleRetry(item) : undefined}
              onAttachmentPress={(a) => {
                if (a.type === 'image') setViewing({ id: a.id, url: a.url, kind: 'image' })
                else window.open(a.url, '_blank', 'noopener')
              }}
            />
          )
        })}
        <div ref={bottomRef} />
      </div>

      {context && (
        <ChatContextDivider
          escrowId={context.escrowId}
          escrowTitle={context.escrowTitle}
          kind={context.kind}
        />
      )}
      {uploading && (
        <p className="py-1 text-center text-xs text-content-tertiary">Uploading attachment…</p>
      )}
      <ChatInput
        onSend={(text) => {
          if (conversationId) void sendMessage(conversationId, text, escrowContext)
        }}
        onAttach={(file) => void upload(file)}
        disabled={uploading}
      />

      <MediaViewerModal item={viewing} onClose={() => setViewing(null)} />

      <ConfirmDialog
        open={closeConfirm}
        title="Close conversation"
        message="This will hide the conversation from your inbox. It will reopen if you message again."
        confirmLabel="Close"
        destructive
        busy={closing}
        onConfirm={() => void confirmCloseConversation()}
        onCancel={() => setCloseConfirm(false)}
      />
    </div>
  )
}
