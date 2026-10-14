'use client'

/**
 * Web analogue of mobile's shared MediaViewerModal, reused by chat now and
 * the dispute thread (S6.1). Split of duties differs from mobile on
 * purpose: the browser renders PDFs natively, so document attachments open
 * in a new tab at the CLICK site (never routed here) and this modal is an
 * image lightbox only.
 */
import { X } from 'lucide-react'
import { ModalBackdrop } from '@/components/ui/overlay/ModalBackdrop'

export interface MediaItem {
  id: string
  url: string
  kind: 'image' | 'document'
}

export function MediaViewerModal({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  if (item === null || item.kind !== 'image') return null
  return (
    <ModalBackdrop
      label="Image attachment"
      onBackdropClick={onClose}
      strongDim
      cardClassName="max-w-[92vw] items-center gap-2 !border-0 !bg-transparent !p-0 !shadow-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN attachment, no next/image loader configured */}
      <img src={item.url} alt="Attachment" className="max-h-[85vh] max-w-full rounded-card object-contain" />
      <button
        type="button"
        aria-label="Close viewer"
        onClick={onClose}
        className="flex h-9 items-center gap-1 rounded-full bg-surface-card px-3 text-sm text-content-primary shadow-md"
      >
        <X size={16} /> Close
      </button>
    </ModalBackdrop>
  )
}
