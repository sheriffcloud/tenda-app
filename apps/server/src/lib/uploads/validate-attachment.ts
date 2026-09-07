/**
 * Shared attachment-field validation for scoped message threads (chat +
 * dispute). Both POST routes accept the same optional `attachment_*` trio and
 * enforce identical rules, so the checks live here once:
 *
 *   - all three fields present together, or none (a text-only message);
 *   - type ∈ {image, file};
 *   - size a positive integer within the type's byte cap;
 *   - URL a Cloudinary link under the caller's sender-scoped folder.
 */
import { ErrorCode, type AttachmentInput, type MessageAttachmentType, type ScopedUploadType } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { UPLOAD_CONSTRAINTS } from '@server/lib/cloudinary'
import { isValidScopedAttachmentUrl } from '@server/lib/uploads/scoped'

export interface ValidatedAttachment {
  attachment_url: string
  attachment_type: MessageAttachmentType
  attachment_size: number
}

export interface AttachmentScope {
  type: ScopedUploadType
  scopeId: string
  userId: string
}

/**
 * Returns the validated attachment, or null for a text-only message.
 * Throws AppError(400) on any malformed / unauthorized attachment.
 */
export function validateMessageAttachment(
  input: AttachmentInput,
  scope: AttachmentScope,
): ValidatedAttachment | null {
  const { attachment_url, attachment_type, attachment_size } = input
  const fields = [attachment_url, attachment_type, attachment_size]
  const hasAttachment = fields.some((f) => f !== undefined)
  if (!hasAttachment) return null

  if (fields.some((f) => f === undefined)) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'attachment_url, attachment_type and attachment_size are required together',
    )
  }
  if (attachment_type !== 'image' && attachment_type !== 'file') {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, "attachment_type must be 'image' or 'file'")
  }
  const maxBytes = UPLOAD_CONSTRAINTS[scope.type].max_file_bytes
  if (
    typeof attachment_size !== 'number' ||
    !Number.isInteger(attachment_size) ||
    attachment_size <= 0 ||
    attachment_size > maxBytes
  ) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, `attachment_size must be 1–${maxBytes} bytes`)
  }
  if (
    typeof attachment_url !== 'string' ||
    !isValidScopedAttachmentUrl(scope.type, attachment_url, scope.scopeId, scope.userId)
  ) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      'attachment_url must be a Cloudinary URL in this scope folder',
    )
  }

  return { attachment_url, attachment_type, attachment_size }
}
