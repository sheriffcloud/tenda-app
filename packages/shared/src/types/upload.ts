export interface CloudinarySignature {
  signature: string
  timestamp: number
  cloud_name: string
  api_key: string
  folder: string
  /** Signed Cloudinary param — uploads in other formats are rejected (S5.12). */
  allowed_formats: string
  /** Client-side size guard; the hard cap is the matching upload preset. */
  max_file_bytes: number
}

export type UploadType = 'avatar' | 'proof' | 'chat' | 'dispute'

/**
 * Upload types whose signed folder is scoped to a resource the caller must
 * belong to (chat → a conversation, dispute → an escrow's dispute thread).
 * The signature request carries `scope_id` and the server authorizes it
 * before minting a signature. `avatar`/`proof` are unscoped.
 */
export type ScopedUploadType = 'chat' | 'dispute'

export const SCOPED_UPLOAD_TYPES: readonly ScopedUploadType[] = ['chat', 'dispute']

export function isScopedUploadType(type: UploadType): type is ScopedUploadType {
  return (SCOPED_UPLOAD_TYPES as readonly string[]).includes(type)
}
