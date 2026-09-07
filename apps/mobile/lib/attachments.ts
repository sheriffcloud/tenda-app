/**
 * Bridges the three attachment "vocabularies" so the mapping lives in one
 * tested place instead of ad-hoc ternaries:
 *
 *   picker      PickedFile.type       'image' | 'video' | 'document'
 *   wire/store  MessageAttachmentType 'image' | 'file'
 *   viewer      MediaKind             'image' | 'video' | 'document'
 */
import type { MessageAttachmentType } from '@tenda/shared'
import type { PickedFile } from '@/components/form/FilePicker'
import type { MediaItem, MediaKind } from '@/components/shared/media/types'

/** An already-uploaded Cloudinary attachment, ready to ride along with a message. */
export interface UploadedAttachment {
  url: string
  type: MessageAttachmentType
  size: number
}

/**
 * Payload a message bubble emits when its attachment is tapped. The screen
 * turns it into a MediaItem for the viewer via `attachmentToMediaItem`.
 */
export interface AttachmentPress {
  id: string
  url: string
  type: MessageAttachmentType
}

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
