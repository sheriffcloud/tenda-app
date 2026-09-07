'use client'

/**
 * One mediation bubble — web twin of mobile's DisputeMessageBubble. The
 * sender arrives RESOLVED (shared resolveDisputeSender): a mediator reads
 * two left-aligned party voices, so each incoming bubble carries its
 * party's role stripe (same accent as the context chips); the mediator's
 * own bubbles are neutral with a transparent stripe so text stays aligned.
 */
import {
  formatConvoTime,
  partyAccent,
  type AttachmentPress,
  type DisputeMessage,
  type DisputeSender,
} from '@tenda/shared'
import { AttachmentPreview } from '@/components/chat/AttachmentPreview'
import { ACCENT_CLASSES } from './party-visual'
import { cn } from '@/lib/cn'

export function DisputeMessageBubble({
  message,
  sender,
  showSender = true,
  showTime = true,
  onAttachmentPress,
}: {
  message: DisputeMessage
  sender: DisputeSender
  /** Render the sender label — true only at the start of a same-sender run. */
  showSender?: boolean
  /** Render the timestamp — true only at the end of a same-sender run. */
  showTime?: boolean
  onAttachmentPress?: (attachment: AttachmentPress) => void
}) {
  const isMine = sender.kind === 'me'
  const stripe = sender.role === null ? 'border-l-transparent' : ACCENT_CLASSES[partyAccent(sender.role)].stripe
  const attachmentUrl = message.attachment_url
  const attachmentType = message.attachment_type

  return (
    <div
      className={cn(
        'flex px-4',
        isMine ? 'justify-end' : 'justify-start',
        showSender ? 'mb-px mt-2' : 'my-px',
      )}
    >
      <div
        className={cn(
          'flex max-w-[80%] flex-col gap-0.5 rounded-2xl px-3.5 py-2',
          isMine ? 'bg-chat-bubble-mine text-white' : 'bg-surface-inset text-content-primary',
          !isMine && cn('border-l-[3px]', stripe),
        )}
      >
        {!isMine && showSender && (
          <p
            className={cn(
              'text-xs font-semibold',
              sender.kind === 'mediator' ? 'text-brand-primary' : 'text-content-tertiary',
            )}
          >
            {sender.label}
          </p>
        )}
        {attachmentUrl !== null && attachmentType !== null && (
          <AttachmentPreview
            url={attachmentUrl}
            type={attachmentType}
            onOpen={() =>
              onAttachmentPress?.({ id: message.id, url: attachmentUrl, type: attachmentType })
            }
          />
        )}
        {message.body.length > 0 && (
          <p className={cn('whitespace-pre-wrap break-words text-[14.5px] leading-5', attachmentUrl !== null && 'mt-1.5')}>
            {message.body}
          </p>
        )}
        {showTime && (
          <p className={cn('self-end type-caption', isMine ? 'text-white/70' : 'text-content-tertiary')}>
            {formatConvoTime(message.created_at)}
          </p>
        )}
      </div>
    </div>
  )
}
