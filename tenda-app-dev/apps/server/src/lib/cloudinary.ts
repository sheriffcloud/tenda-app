import { createHash } from 'node:crypto'
import { getConfig } from '@server/config'
import { isScopedUploadType, type CloudinarySignature, type UploadType } from '@tenda/shared'
import { scopedUploadFolder } from '@server/lib/uploads/scoped'

/** Folders for the unscoped upload types; scoped folders come from the registry. */
const UNSCOPED_FOLDER: Record<'avatar' | 'proof', string> = {
  avatar: 'tenda/avatars',
  proof: 'tenda/proofs',
}

/**
 * S5.12 (closes open #26) per-type upload constraints.
 * `allowed_formats` is a signed Cloudinary upload parameter, uploads with
 * other formats are rejected server-side by Cloudinary. `max_file_bytes`
 * is NOT a signable upload-API parameter (Cloudinary enforces size caps
 * via upload presets); it is returned as the client-side guard value and
 * the matching preset limit is an ops setting (#53).
 */
export const UPLOAD_CONSTRAINTS: Record<
  UploadType,
  { allowed_formats: string; max_file_bytes: number }
> = {
  // Client downscales avatars before upload (mobile pickAvatar), so this cap is
  // generous headroom for the rare large-after-compression case rather than a
  // tight gate, keeps a big source photo from being rejected outright.
  avatar: { allowed_formats: 'jpg,png,webp', max_file_bytes: 10 * 1024 * 1024 },
  proof: { allowed_formats: 'jpg,png,webp,pdf', max_file_bytes: 10 * 1024 * 1024 },
  chat: { allowed_formats: 'jpg,png,webp,pdf', max_file_bytes: 10 * 1024 * 1024 },
  // Dispute evidence mirrors chat exactly (image + PDF, 10 MB).
  dispute: { allowed_formats: 'jpg,png,webp,pdf', max_file_bytes: 10 * 1024 * 1024 },
}

/**
 * Resolve the signed folder for an upload. Scoped types (chat, dispute) pin
 * the folder to `<base>/<scopeId>/<userId>`; `proof` is per-user; `avatar` is
 * a flat shared folder.
 */
function resolveUploadFolder(
  type: UploadType,
  userId: string | undefined,
  scopeId: string | undefined,
): string {
  if (isScopedUploadType(type)) {
    if (scopeId === undefined || userId === undefined) {
      // Fail loud: an unscoped signature would defeat the per-resource folder
      // isolation the send routes rely on.
      throw new Error(`${type} upload signatures require userId + scopeId`)
    }
    return scopedUploadFolder(type, scopeId, userId)
  }
  if (type === 'proof' && userId !== undefined) return `${UNSCOPED_FOLDER.proof}/${userId}`
  return UNSCOPED_FOLDER[type]
}

export function generateUploadSignature(
  type: UploadType,
  userId?: string,
  scopeId?: string,
): CloudinarySignature {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = getConfig()

  const folder = resolveUploadFolder(type, userId, scopeId)
  const timestamp = Math.round(Date.now() / 1000)
  const constraints = UPLOAD_CONSTRAINTS[type]

  // Signed params must be alphabetically ordered in the string-to-sign.
  const toSign = `allowed_formats=${constraints.allowed_formats}&folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`
  const signature = createHash('sha1').update(toSign).digest('hex')

  return {
    signature,
    timestamp,
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    folder,
    allowed_formats: constraints.allowed_formats,
    max_file_bytes: constraints.max_file_bytes,
  }
}
