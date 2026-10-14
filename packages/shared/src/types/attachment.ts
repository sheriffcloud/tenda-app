/**
 * Shared attachment shape for off-chain message threads (chat + dispute).
 * Both surfaces persist a single Cloudinary attachment per message; defining
 * the wire fields once stops the two message types drifting apart.
 */

/** The two kinds of message attachment the product supports (image | PDF). */
export type MessageAttachmentType = 'image' | 'file'

/**
 * Persisted/wire attachment columns. Nullable as a group: a message either
 * carries all three (a real attachment) or none of them.
 */
export interface AttachmentFields {
  attachment_url: string | null
  attachment_type: MessageAttachmentType | null
  attachment_size: number | null
}

/**
 * Optional attachment on a send request. All three present together or none —
 * the server rejects a partial set.
 */
export interface AttachmentInput {
  /** Cloudinary URL under the caller's scoped upload folder. */
  attachment_url?: string
  attachment_type?: MessageAttachmentType
  /** Bytes — client-reported; the hard cap is the upload preset. */
  attachment_size?: number
}

/**
 * An already-uploaded Cloudinary attachment, ready to ride along with a
 * message. The camelCase, client-facing twin of `AttachmentFields` above: the
 * fields are the same three, non-null as a group because an upload has either
 * completed or not happened.
 *
 * Here rather than per client (#43) for the reason this file's own docstring
 * already gives — "defining the wire fields once stops the two message types
 * drifting apart" — which both clients honoured for the snake_case wire and
 * then quietly broke by writing character-identical camelCase copies locally.
 * The CONVERSIONS stay per client: a browser `File` and an RN `PickedFile` are
 * genuinely different inputs.
 */
export interface UploadedAttachment {
  url: string
  type: MessageAttachmentType
  size: number
}

/**
 * Payload a message bubble emits when its attachment is activated. The screen
 * turns it into whatever its viewer takes — a `MediaItem` on mobile, a
 * lightbox entry or a new tab on web.
 */
export interface AttachmentPress {
  id: string
  url: string
  type: MessageAttachmentType
}
