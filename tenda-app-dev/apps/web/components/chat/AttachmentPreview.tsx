'use client'

/**
 * In-bubble attachment rendering — web twin of mobile's shared
 * AttachmentPreview: images show a thumbnail (click → lightbox), files
 * show a document chip (click → the caller opens the PDF in a new tab).
 */
import { FileText } from 'lucide-react'
import type { MessageAttachmentType } from '@tenda/shared'

export function AttachmentPreview({
  url,
  type,
  onOpen,
}: {
  url: string
  type: MessageAttachmentType
  onOpen: () => void
}) {
  if (type === 'image') {
    return (
      <button type="button" onClick={onOpen} aria-label="View image attachment" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN attachment, no next/image loader configured */}
        <img src={url} alt="Attachment" className="max-h-64 w-full rounded-xl object-cover" />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open document attachment"
      className="flex items-center gap-2 rounded-xl bg-black/10 px-3 py-2 text-sm"
    >
      <FileText size={16} className="shrink-0" />
      <span className="truncate">Document (PDF)</span>
    </button>
  )
}
