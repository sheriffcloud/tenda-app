'use client'

/**
 * Web twin of mobile's chat MessageBubble: mine right/blue, theirs left on
 * an inset surface; failed sends get a danger border + Retry affordance;
 * optimistic sends show a "Sending…" line. The report affordance (mobile:
 * long-press) arrives with the moderation surfaces (S6).
 */
import { AttachmentPreview } from './AttachmentPreview'
import type { AttachmentPress } from '@tenda/shared'
import type { LocalMessage } from '@/stores/chat.store'
import { cn } from '@/lib/cn'

export function MessageBubble({
  message,
  isMine,
  onRetry,
  onAttachmentPress,
}: {
  message: LocalMessage
  isMine: boolean
  onRetry?: () => void
  onAttachmentPress?: (attachment: AttachmentPress) => void
}) {
  const isFailed = message._status === 'failed'
  const isSending = message._status === 'sending'
  const attachmentUrl = message.attachment_url
  const attachmentType = message.attachment_type

  return (
    <div className={cn('flex px-4 pt-0.5', isMine ? 'justify-end' : 'justify-start')}>
      <div className="flex max-w-[78%] flex-col">
        <div
          className={cn(
            'px-3.5 py-2.5 text-[14.5px] leading-5',
            isMine
              ? 'rounded-t-2xl rounded-bl-2xl rounded-br-md'
              : 'rounded-t-2xl rounded-br-2xl rounded-bl-md',
            isMine && !isFailed && 'bg-chat-bubble-mine text-white',
            !isMine && 'bg-surface-inset text-content-primary',
            isFailed && 'border border-feedback-danger-base bg-surface-card text-content-primary',
          )}
        >
          {attachmentUrl !== null && attachmentType !== null && (
            <AttachmentPreview
              url={attachmentUrl}
              type={attachmentType}
              onOpen={() =>
                onAttachmentPress?.({ id: message.id, url: attachmentUrl, type: attachmentType })
              }
            />
          )}

          {message.content.length > 0 && (
            <p className={cn('whitespace-pre-wrap break-words', attachmentUrl !== null && 'mt-1.5')}>
              {message.content}
            </p>
          )}

          {isFailed && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1.5 flex items-center gap-1.5 text-xs text-feedback-danger-base"
            >
              Didn&apos;t send <span className="text-content-tertiary">·</span>{' '}
              <span className="font-semibold">Retry</span>
            </button>
          )}
        </div>

        {isSending && (
          <span className="mt-1 self-end type-caption text-content-tertiary">Sending…</span>
        )}
      </div>
    </div>
  )
}
