/**
 * Notification IDENTITY: deriving a stable id, and refusing a malformed one.
 *
 * Separate from the producers because it is the one part with no dependency on
 * the queue, the database or the wire — pure string work, and the piece a
 * caller reaches for directly when it needs a re-runnable notice.
 */

import { createHash } from 'node:crypto'
import { ErrorCode } from '@tenda/shared'
import { isUuidLike } from '@server/lib/uuid'
import { AppError } from '@server/lib/errors'

/**
 * NUL separator: the parts are entity ids and channel slugs, and NUL is the
 * one byte none of them can contain, so ('a','bc') and ('ab','c') can never
 * hash to the same id. Escape sequence, never a literal control byte in
 * source — a raw NUL makes the file 'binary' to grep and diff tooling.
 */
const PART_SEPARATOR = '\u0000'

/**
 * Deterministic notification id derived from the identity of the notice.
 *
 * `notifications.id` is a postgres `uuid` column, so a producer CANNOT just
 * use a readable key like `dispute-alert.<id>.<user>` — that reaches the
 * driver as `invalid input syntax for type uuid`, and because it fails inside
 * the delivery worker it fails on every retry, forever, with no user-visible
 * signal. So the parts are hashed into a well-formed UUID instead.
 *
 * RFC 9562 version 8 (custom/vendor layout) is the honest version nibble for a
 * SHA-256-derived name: v5 is defined as SHA-1, and claiming v5 would misstate
 * the algorithm.
 */
export function stableNotificationId(...parts: string[]): string {
  const bytes = createHash('sha256').update(parts.join(PART_SEPARATOR)).digest().subarray(0, 16)
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x80, 6) // version 8 (RFC 9562 custom)
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8) // RFC 9562 variant
  const h = bytes.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * Reject a malformed caller-supplied id.
 *
 * Fail here, at the producer, rather than in the delivery worker: a malformed
 * id only breaks at INSERT time, where the failure is a retry loop on a job
 * nobody is watching. Shared by the single- and many-recipient producers so
 * both refuse the same values with the same sentence.
 */
export function assertNotificationId(id: string): void {
  if (!isUuidLike(id)) {
    throw new AppError(
      500,
      ErrorCode.INTERNAL_ERROR,
      'notification id must be a UUID (build it with stableNotificationId)',
    )
  }
}
