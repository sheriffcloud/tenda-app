'use client'

/**
 * Web analogue of mobile's ConfirmDialog convention (never window.confirm):
 * a ModalBackdrop-composed alert with an explicit destructive variant and a
 * busy-disabled confirm. Backdrop click and Escape both cancel — except
 * while busy, when EVERY way out is locked (the request keeps running, so a
 * dialog that vanished mid-operation would be lying about it). Both
 * dismissals ride ModalBackdrop's one `onBackdropClick` seam.
 *
 * `figure` is the comps' money line: one large monospace amount under the
 * body, for gates where the number IS the decision.
 *
 * Initial focus deviates from the comp, which autofocuses Confirm. That is
 * fine for a benign gate and dangerous for a destructive one — a stray Enter
 * would fire the irreversible action. Destructive dialogs focus Cancel; the
 * rest focus Confirm.
 */
import type { ReactNode } from 'react'
import { Button } from '../Button'
import { ModalBackdrop } from './ModalBackdrop'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  /** A headline amount, rendered in tabular monospace (comps' money line). */
  figure?: string
  /**
   * Extra content between the figure and the buttons (the tx gate's signer
   * row). Focus stays where the gate intends it: the action buttons carry
   * explicit `data-initial-focus` anchors, so controls here never steal it.
   */
  extra?: ReactNode
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  figure,
  extra,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <ModalBackdrop
      role="alertdialog"
      label={title}
      // Kept as the no-anchor fallback; the buttons below carry explicit
      // data-initial-focus anchors so `extra` controls cannot steal focus.
      initialFocus={destructive ? 'first' : 'last'}
      {...(busy ? {} : { onBackdropClick: onCancel })}
    >
      <h2 className="type-h2 text-content-primary">
        {title}
      </h2>
      {/* pre-line: tx-gate copy separates its wallet note with a blank line */}
      {message !== undefined && (
        <p className="whitespace-pre-line type-body text-content-secondary">
          {message}
        </p>
      )}
      {figure !== undefined && figure !== '' && (
        <p className="type-mono-mid font-bold text-utility-money">{figure}</p>
      )}
      {extra}
      <div className="flex justify-end gap-2.5">
        <Button
          variant="ghost"
          size="md"
          disabled={busy}
          onClick={onCancel}
          // A stray Enter on a destructive gate must never fire the action.
          {...(destructive ? { 'data-initial-focus': true } : {})}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={busy}
          className={destructive ? 'bg-feedback-danger-base hover:bg-feedback-danger-base/90' : undefined}
          onClick={onConfirm}
          {...(destructive ? {} : { 'data-initial-focus': true })}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </ModalBackdrop>
  )
}
