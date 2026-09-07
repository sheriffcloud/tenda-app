'use client'

/**
 * Web stand-in for mobile's BottomSheet: a titled modal dialog the input
 * surfaces (proof upload, dispute, review, apply) share. Backdrop click and
 * the close button both cancel; content owns its own buttons.
 */
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { ModalBackdrop } from './ModalBackdrop'

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <ModalBackdrop
      label={title}
      onBackdropClick={onClose}
      cardClassName="max-w-md gap-4 max-h-[85vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-content-primary">{title}</h2>
        <button
          type="button"
          aria-label="Close"
          className="text-content-tertiary hover:text-content-primary"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </ModalBackdrop>
  )
}
