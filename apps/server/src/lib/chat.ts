/**
 * Chat presentation helpers shared by the conversations routes and the
 * message push/WS fan-out.
 */

import { ATTACHMENT_PREVIEW } from '@tenda/shared'

const PREVIEW_MAX = 100
export { ATTACHMENT_PREVIEW }

/**
 * Inbox / push-notification preview for a message. Attachment-only
 * messages (S5.2) carry empty content, surface a placeholder instead of
 * a blank line.
 */
export function messagePreview(content: string | null, hasAttachment: boolean): string | null {
  const trimmed = (content ?? '').trim()
  if (trimmed.length > 0) return trimmed.slice(0, PREVIEW_MAX)
  return hasAttachment ? ATTACHMENT_PREVIEW : null
}
