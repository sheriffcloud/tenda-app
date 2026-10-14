/**
 * Inline outcome notice — web's stand-in for mobile's fire-and-forget toast
 * until a toast layer exists. Renders nothing without a message.
 */
import { cn } from '@/lib/cn'

interface NoticeProps {
  tone: 'success' | 'error'
  message: string | null
}

export function Notice({ tone, message }: NoticeProps) {
  if (message === null || message === '') return null
  return (
    <p
      role="status"
      className={cn(
        'rounded-control border px-4 py-2 text-sm',
        tone === 'success'
          ? 'border-feedback-success-base/40 bg-feedback-success-surface text-feedback-success-base'
          : 'border-feedback-danger-base/40 bg-feedback-danger-surface text-feedback-danger-base',
      )}
    >
      {message}
    </p>
  )
}
