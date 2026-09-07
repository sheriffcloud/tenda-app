/**
 * Bridges the three attachment "vocabularies" so the mapping lives in one
 * tested place instead of ad-hoc ternaries:
 *
 *   picker      PickedFile.type       'image' | 'video' | 'document'
 *   wire/store  MessageAttachmentType 'image' | 'file'
 *   viewer      MediaKind             'image' | 'video' | 'document'
 *
 * The TYPES that describe an attachment itself (`UploadedAttachment`,
 * `AttachmentPress`) moved to @tenda/shared beside `AttachmentFields` (#43) —
 * they were declared character-identically here and in web's lib/uploads. The
 * conversions below stay because a `PickedFile` and a browser `File` are
 * genuinely different inputs, as are a `MediaItem` and a lightbox entry.
 */
import type { MessageAttachmentType } from '@tenda/shared'
import type { PickedFile } from '@/components/form/FilePicker'
import type { MediaItem, MediaKind } from '@/components/shared/media/types'

/** Picked file → stored attachment type (anything non-image is a 'file'/PDF). */
export function pickedToAttachmentType(picked: PickedFile['type']): MessageAttachmentType {
  return picked === 'image' ? 'image' : 'file'
}

/** Stored attachment type → viewer media kind ('file' surfaces as a document). */
export function attachmentToMediaKind(type: MessageAttachmentType): MediaKind {
  return type === 'image' ? 'image' : 'document'
}

/** Build the viewer descriptor for a message attachment. */
export function attachmentToMediaItem(
  id: string,
  url: string,
  type: MessageAttachmentType,
): MediaItem {
  return { id, url, type: attachmentToMediaKind(type) }
}
