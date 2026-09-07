import { api } from '@/api/client'
import type { UploadType } from '@tenda/shared'

export interface ProofFile {
  uri: string
  mimeType: string
  name: string
  /** Bytes, when the picker reports it, pre-flight size guard. */
  size?: number
}

export interface UploadResult {
  url: string
  /** Authoritative size from Cloudinary's response. */
  bytes: number
}

/**
 * React Native's FormData accepts a `{ uri, name, type }` file part (the
 * native uploader streams the file at `uri`), but the TS DOM lib types only
 * model `string | Blob`. This helper is the ONE sanctioned bridge cast,
 * typed input, single site, so the escape hatch can't spread.
 */
function rnFilePart(part: { uri: string; name: string; type: string }): Blob {
  return part as unknown as Blob
}

/**
 * Upload a file to Cloudinary using a server-signed upload request.
 * Supports images, videos, and documents.
 * `scopeId` is required for scoped types ('chat' → conversation id, 'dispute'
 * → escrow id); the server scopes the signed folder to it and rejects
 * unscoped requests.
 */
export async function uploadToCloudinaryDetailed(
  file: ProofFile,
  type: UploadType,
  scopeId?: string,
): Promise<UploadResult> {
  const { signature, timestamp, cloud_name, api_key, folder, allowed_formats, max_file_bytes } =
    await api.upload.signature(
      scopeId !== undefined ? { type, scope_id: scopeId } : { type },
    )

  // Pre-flight guard, saves the user a doomed upload when the picker
  // reports a size. The hard cap is the Cloudinary upload preset.
  if (file.size !== undefined && file.size > max_file_bytes) {
    throw new Error(`File is too large, max ${Math.floor(max_file_bytes / (1024 * 1024))} MB`)
  }

  const formData = new FormData()
  formData.append('file', rnFilePart({ uri: file.uri, name: file.name, type: file.mimeType }))
  formData.append('api_key', api_key)
  formData.append('timestamp', String(timestamp))
  formData.append('signature', signature)
  formData.append('folder', folder)
  // Signed param (S5.12), must be sent or Cloudinary rejects the signature.
  formData.append('allowed_formats', allowed_formats)

  // Abort the upload after 120 s to prevent silent hangs on large files / slow connections.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  let response: Response
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`,
      {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      },
    )
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Upload timed out, check your connection and try again')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error?.error?.message ?? 'Cloudinary upload failed')
  }

  const result = await response.json() as { secure_url: string; bytes: number }
  return { url: result.secure_url, bytes: result.bytes }
}

/** Convenience wrapper returning just the secure CDN URL. */
export async function uploadToCloudinary(
  file: ProofFile,
  type: UploadType,
  scopeId?: string,
): Promise<string> {
  return (await uploadToCloudinaryDetailed(file, type, scopeId)).url
}
