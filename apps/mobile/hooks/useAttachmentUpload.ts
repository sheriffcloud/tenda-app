/**
 * Pick an image or PDF and upload it to the caller's scoped Cloudinary folder,
 * then hand the uploaded attachment back. Shared by the chat and dispute
 * threads so the pick → upload → error-handling flow lives in one place; each
 * screen supplies its own scope and its own send path via `onUploaded`.
 */
import { useCallback, useState } from 'react'
import type { ScopedUploadType } from '@tenda/shared'
import { pickImage, pickDocument } from '@/components/form/FilePicker'
import { uploadToCloudinaryDetailed } from '@/lib/upload'
import { pickedToAttachmentType, type UploadedAttachment } from '@/lib/attachments'
import { showToast } from '@/components/ui/Toast'

export type AttachmentKind = 'image' | 'document'

interface Options {
  type: ScopedUploadType
  /** The resource the upload is scoped to (conversation id / escrow id). */
  scopeId: string | null
  onUploaded: (attachment: UploadedAttachment) => void | Promise<void>
}

export function useAttachmentUpload({ type, scopeId, onUploaded }: Options) {
  const [uploading, setUploading] = useState(false)

  const pick = useCallback(
    async (kind: AttachmentKind) => {
      if (scopeId === null || uploading) return
      const file = kind === 'image' ? await pickImage() : await pickDocument(['application/pdf'])
      if (!file) return
      setUploading(true)
      try {
        const { url, bytes } = await uploadToCloudinaryDetailed(file, type, scopeId)
        await onUploaded({ url, type: pickedToAttachmentType(file.type), size: bytes })
      } catch (e) {
        showToast('error', e instanceof Error ? e.message : 'Upload failed, please try again')
      } finally {
        setUploading(false)
      }
    },
    [type, scopeId, uploading, onUploaded],
  )

  return { uploading, pick }
}
