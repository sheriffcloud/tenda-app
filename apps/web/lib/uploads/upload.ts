/**
 * Cloudinary server-signed direct upload — web port of mobile's lib/upload.
 * The flow is identical (signature from our server, direct POST to
 * Cloudinary, 120s abort); only the file part differs: the browser has real
 * `File` objects, so mobile's RN `{uri,name,type}` bridge cast disappears.
 */
import { api } from '@/api/client'
import type { UploadType } from '@tenda/shared'

export interface UploadResult {
  url: string
  /** Authoritative size from Cloudinary's response. */
  bytes: number
}

/**
 * Upload a file to Cloudinary using a server-signed upload request.
 * `scopeId` is required for scoped types ('chat' → conversation id, 'dispute'
 * → escrow id); the server scopes the signed folder to it and rejects
 * unscoped requests.
 */
export async function uploadToCloudinaryDetailed(
  file: File,
  type: UploadType,
  scopeId?: string,
): Promise<UploadResult> {
  const { signature, timestamp, cloud_name, api_key, folder, allowed_formats, max_file_bytes } =
    await api.upload.signature(
      scopeId !== undefined ? { type, scope_id: scopeId } : { type },
    )

  // Pre-flight guard, saves the user a doomed upload. The hard cap is the
  // Cloudinary upload preset.
  if (file.size > max_file_bytes) {
    throw new Error(`File is too large, max ${Math.floor(max_file_bytes / (1024 * 1024))} MB`)
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', api_key)
  formData.append('timestamp', String(timestamp))
  formData.append('signature', signature)
  formData.append('folder', folder)
  // Signed param (S5.12), must be sent or Cloudinary rejects the signature.
  formData.append('allowed_formats', allowed_formats)

  // Abort after 120 s to prevent silent hangs on large files / slow links.
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
    const error = (await response.json()) as { error?: { message?: string } }
    throw new Error(error?.error?.message ?? 'Cloudinary upload failed')
  }

  const result = (await response.json()) as { secure_url: string; bytes: number }
  return { url: result.secure_url, bytes: result.bytes }
}

/** Convenience wrapper returning just the secure CDN URL. */
export async function uploadToCloudinary(
  file: File,
  type: UploadType,
  scopeId?: string,
): Promise<string> {
  return (await uploadToCloudinaryDetailed(file, type, scopeId)).url
}
