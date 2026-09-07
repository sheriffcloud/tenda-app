'use client'

/**
 * Stage-6 moderation warn verdict — web twin of mobile's
 * moderation/PriceWarningSheet: one explicit confirmation, "Publish anyway"
 * records the acknowledgment server-side. Backdrop click = "Edit gig" (the
 * safe exit), so dismissing never publishes.
 */
import { AlertTriangle } from 'lucide-react'
import type { ModerationReason } from '@tenda/shared'
import { Button } from '@/components/ui/Button'
import { ModalBackdrop } from '@/components/ui/overlay/ModalBackdrop'

export function PriceWarningDialog({
  open,
  reasons,
  onPublishAnyway,
  onEdit,
}: {
  open: boolean
  reasons: ModerationReason[]
  onPublishAnyway: () => void
  onEdit: () => void
}) {
  if (!open) return null
  return (
    <ModalBackdrop role="alertdialog" label="Before you publish" onBackdropClick={onEdit} cardClassName="max-w-sm gap-3">
      <h2 className="font-display text-lg font-bold text-content-primary">Before you publish</h2>
      {reasons.map((r, i) => (
        <p key={`${r.code}-${i}`} className="flex items-start gap-2 text-sm text-content-secondary">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-feedback-warning-base" aria-hidden />
          {r.message}
        </p>
      ))}
      <Button variant="primary" size="lg" fullWidth onClick={onPublishAnyway}>
        Publish anyway
      </Button>
      <Button variant="ghost" size="md" fullWidth onClick={onEdit}>
        Edit gig
      </Button>
    </ModalBackdrop>
  )
}
