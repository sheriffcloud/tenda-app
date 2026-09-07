/**
 * Upload a picked image/PDF to the caller's scoped Cloudinary folder and
 * hand the uploaded attachment back — web analogue of mobile's
 * useAttachmentUpload, shared by the chat thread now and the dispute
 * thread (S6.1). The one platform difference: the browser's `<input
 * type="file">` hands us a File directly, so the hook exposes
 * `upload(file)` instead of driving native pickers itself; each screen
 * supplies its own scope and its own send path via `onUploaded`.
 */
import { useCallback, useState } from 'react'
import type { ScopedUploadType, UploadedAttachment } from '@tenda/shared'
import { uploadToCloudinaryDetailed } from '@/lib/uploads/upload'
import { fileToAttachmentType } from '@/lib/uploads/attachments'
import { showToast } from '@/components/ui/Toast'

interface Options {
  type: ScopedUploadType
  /** The resource the upload is scoped to (conversation id / escrow id). */
  scopeId: string | null
  onUploaded: (attachment: UploadedAttachment) => void | Promise<void>
}

export function useAttachmentUpload({ type, scopeId, onUploaded }: Options) {
  const [uploading, setUploading] = useState(false)

  const upload = useCallback(
    async (file: File) => {
      if (scopeId === null || uploading) return
      setUploading(true)
      try {
        const { url, bytes } = await uploadToCloudinaryDetailed(file, type, scopeId)
        await onUploaded({ url, type: fileToAttachmentType(file), size: bytes })
      } catch (e) {
        showToast('error', e instanceof Error ? e.message : 'Upload failed, please try again')
      } finally {
        setUploading(false)
      }
    },
    [type, scopeId, uploading, onUploaded],
  )

  return { uploading, upload }
}
