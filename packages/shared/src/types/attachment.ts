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
