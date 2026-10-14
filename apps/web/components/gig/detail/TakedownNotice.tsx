'use client'

/**
 * The banner a taken-down escrow shows at the top of its detail — web twin
 * of mobile's TakedownNotice over the SHARED copy + audience derivation.
 * Renders NOTHING when the escrow is visible, so detail bodies mount it
 * unconditionally.
 */
import {
  takedownAudience,
  takedownCopy,
  type TakedownEscrow,
  type TakedownSubject,
} from '@tenda/shared'

export function TakedownNotice({
  escrow,
  subject,
  viewerId,
}: {
  escrow: TakedownEscrow
  subject: TakedownSubject
  viewerId: string
}) {
  if (!escrow.hidden) return null
  const { title, detail } = takedownCopy(takedownAudience(escrow, viewerId), subject)
  return (
    <div
      role="status"
      className="rounded-card border border-feedback-warning-base/40 bg-feedback-warning-surface px-4 py-3"
    >
      <p className="text-sm font-semibold text-feedback-warning-base">{title}</p>
      <p className="mt-1 text-xs text-content-secondary">{detail}</p>
    </div>
  )
}
