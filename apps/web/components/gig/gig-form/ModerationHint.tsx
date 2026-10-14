'use client'

/**
 * Stage-6 live moderation hint above the submit bar — web twin of mobile's
 * gig-form/ModerationHint. Advisory, never blocking. Renders null on
 * approve or when there's no reason to show.
 */
import type { ModerationPreviewResponse } from '@tenda/shared'
import { cn } from '@/lib/cn'

export function ModerationHint({ moderation }: { moderation: ModerationPreviewResponse | null }) {
  if (moderation === null || moderation.decision === 'approve' || moderation.reasons.length === 0) {
    return null
  }
  const isBlock = moderation.decision === 'block'
  return (
    <p
      role="status"
      className={cn(
        // The hint owns its top margin because it renders conditionally: a
        // wrapper carrying the spacing would leave a dead gap on every step
        // that has nothing to say.
        'mt-6 rounded-control px-3 py-2 text-xs',
        isBlock
          ? 'bg-feedback-danger-surface text-feedback-danger-base'
          : 'bg-feedback-warning-surface text-feedback-warning-base',
      )}
    >
      {moderation.reasons[0].message}
    </p>
  )
}
