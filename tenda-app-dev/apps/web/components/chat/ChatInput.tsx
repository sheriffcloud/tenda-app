'use client'

/**
 * Composer bar — web twin of mobile's ui/ChatInput. Enter sends,
 * Shift+Enter breaks the line (mobile's submitBehavior analogue); the
 * paperclip drives a hidden file input (image or PDF — the AttachSheet
 * collapses into the browser's own picker). The SDK-54 keyboard workaround
 * has no web analogue and is dropped per the stage doc.
 */
import { useRef, useState } from 'react'
import { Paperclip, ArrowUp } from 'lucide-react'
import { MESSAGE_MAX_LENGTH } from '@tenda/shared'
import { cn } from '@/lib/cn'

export function ChatInput({
  onSend,
  onAttach,
  disabled,
}: {
  onSend: (text: string) => void
  /** Called with the picked image/PDF; omit to hide the attach affordance. */
  onAttach?: (file: File) => void
  disabled?: boolean
}) {
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }

  const canSend = text.trim().length > 0 && !disabled

  return (
    <div className="border-t border-border-subtle px-4 pb-3 pt-2.5">
      <div className="flex items-center gap-2 rounded-[26px] border border-border-subtle bg-surface-card py-1.5 pl-3.5 pr-1.5">
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              aria-label="Choose attachment"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onAttach(file)
                e.target.value = '' // allow re-picking the same file
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
              aria-label="Attach file"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-content-tertiary transition-opacity hover:opacity-60"
            >
              <Paperclip size={18} />
            </button>
          </>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // isComposing: Enter during IME composition (CJK input) commits
            // the composition — it must never send the message.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Message…"
          maxLength={MESSAGE_MAX_LENGTH}
          rows={1}
          className="max-h-24 min-h-6 flex-1 resize-none bg-transparent type-body text-content-primary outline-none placeholder:text-content-tertiary"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
            canSend ? 'bg-brand-solid text-brand-on-primary' : 'bg-surface-inset text-content-tertiary',
          )}
        >
          <ArrowUp size={18} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
