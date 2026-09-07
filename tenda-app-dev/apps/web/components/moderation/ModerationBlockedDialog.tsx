'use client'

/**
 * Stage-6 moderation block verdict — web twin of mobile's
 * moderation/ModerationBlockedDialog: no retry path, the only exit is
 * editing (so no backdrop dismissal either — the message must be read).
 */
import { ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ModalBackdrop } from '@/components/ui/overlay/ModalBackdrop'

export function ModerationBlockedDialog({
  open,
  message,
  onEdit,
}: {
  open: boolean
  /** User-facing reason from the server's block verdict. */
  message: string
  onEdit: () => void
}) {
  if (!open) return null
  return (
    <ModalBackdrop
      role="alertdialog"
      label="This gig can't be published"
      strongDim
      cardClassName="max-w-sm gap-4 items-center text-center"
    >
      <ShieldX size={48} className="text-feedback-danger-base" aria-hidden />
      <h2 className="font-display text-lg font-bold text-content-primary">
        This gig can&apos;t be published
      </h2>
      <p className="text-sm text-content-secondary">{message}</p>
      <Button variant="primary" size="lg" fullWidth onClick={onEdit}>
        Edit gig
      </Button>
    </ModalBackdrop>
  )
}
