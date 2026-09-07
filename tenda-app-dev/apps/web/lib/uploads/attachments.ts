/**
 * Web's half of the message-attachment vocabulary: the browser `File` bridged
 * to the shared wire type on the way in.
 *
 * The TYPES (`UploadedAttachment`, `AttachmentPress`) moved to @tenda/shared
 * beside `AttachmentFields` (#43). They had been declared character-identically
 * here and in mobile's lib/attachments, next to a shared file whose docstring
 * already said "defining the wire fields once stops the two message types
 * drifting apart" — true of the snake_case columns and quietly untrue of the
 * camelCase twins the clients each kept. The CONVERSION below stays local
 * because a browser `File` and an RN `PickedFile` are genuinely different
 * inputs.
 */
import type { MessageAttachmentType } from '@tenda/shared'

/** Picked browser File → stored attachment type (anything non-image is a 'file'/PDF). */
export function fileToAttachmentType(file: File): MessageAttachmentType {
  return file.type.startsWith('image/') ? 'image' : 'file'
}
