/**
 * The opaque cursor GET /v1/gigs pages with — encode, decode, and refuse.
 *
 * NOT a route — a sibling of index.ts, which is the only file @fastify/autoload
 * registers from this directory (see the note atop list-filters.ts). Said here
 * because the header is the only place a reader can tell: a bare file in a route
 * directory is indistinguishable from a route until you read its exports, and
 * `list-filters.ts` and `public-feed.ts` beside it both say it.
 */
import { Buffer } from 'node:buffer'
import { AppError } from '@server/lib/errors'
import { ErrorCode } from '@tenda/shared'
import { isUuidLike } from '@server/lib/uuid'

export interface GigFeedCursor {
  created_at: Date
  escrow_id: string
}

export const GIG_FEED_CURSOR_MAX_LENGTH = 512
const BASE64URL_WITHOUT_PADDING = /^[A-Za-z0-9_-]+$/

export function encodeGigFeedCursor(cursor: GigFeedCursor): string {
  return Buffer.from(JSON.stringify({
    created_at: cursor.created_at.toISOString(),
    escrow_id: cursor.escrow_id,
  })).toString('base64url')
}

export function decodeGigFeedCursor(value: string): GigFeedCursor {
  if (
    value.length === 0 ||
    value.length > GIG_FEED_CURSOR_MAX_LENGTH ||
    !BASE64URL_WITHOUT_PADDING.test(value)
  ) throw invalidCursor()
  let parsed: unknown
  try {
    const decoded = Buffer.from(value, 'base64url')
    if (decoded.toString('base64url') !== value) throw invalidCursor()
    parsed = JSON.parse(decoded.toString('utf8'))
  } catch {
    throw invalidCursor()
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw invalidCursor()
  if (!('created_at' in parsed) || typeof parsed.created_at !== 'string') throw invalidCursor()
  if (!('escrow_id' in parsed) || typeof parsed.escrow_id !== 'string' || !isUuidLike(parsed.escrow_id)) throw invalidCursor()
  const createdAt = new Date(parsed.created_at)
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== parsed.created_at) throw invalidCursor()
  return { created_at: createdAt, escrow_id: parsed.escrow_id }
}

function invalidCursor(): AppError {
  return new AppError(400, ErrorCode.VALIDATION_ERROR, 'cursor is invalid')
}
