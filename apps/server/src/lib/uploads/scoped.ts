/**
 * Registry for "scoped" Cloudinary uploads — those whose signed folder is
 * pinned to a resource the caller must belong to. Adding a new scoped upload
 * context (e.g. review attachments) is one entry here: a folder base and an
 * authorizer. The signature route, the URL validator, and the message routes
 * all derive their behaviour from this one table, so the three never drift.
 *
 *   chat    → scoped to a conversation the caller is a member of
 *   dispute → scoped to an escrow whose dispute thread the caller may access
 */
import { and, eq, or } from 'drizzle-orm'
import { conversations } from '@tenda/shared/db/schema'
import { ErrorCode, type ScopedUploadType } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { assertDisputeThreadAccess } from '@server/lib/disputes/thread-access'
import type { AppDatabase } from '@server/plugins/db'

export interface UploadCaller {
  id: string
  role: string
}

/** Throws AppError (403/404) when `caller` may not upload to `scopeId`. */
type Authorizer = (db: AppDatabase, caller: UploadCaller, scopeId: string) => Promise<void>

interface ScopedUploadDef {
  /** Cloudinary folder prefix; the full folder is `<base>/<scopeId>/<userId>`. */
  base: string
  authorize: Authorizer
}

async function authorizeChatUpload(
  db: AppDatabase,
  caller: UploadCaller,
  conversationId: string,
): Promise<void> {
  const [member] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        or(eq(conversations.user_a_id, caller.id), eq(conversations.user_b_id, caller.id)),
      ),
    )
    .limit(1)
  if (member === undefined) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'not a member of this conversation')
  }
}

async function authorizeDisputeUpload(
  db: AppDatabase,
  caller: UploadCaller,
  escrowId: string,
): Promise<void> {
  // Reuses the exact thread-access rule the dispute message route enforces;
  // throws 404 (no dispute) / 403 (not a party or mediator).
  await assertDisputeThreadAccess(db, escrowId, caller)
}

const SCOPED_UPLOADS: Record<ScopedUploadType, ScopedUploadDef> = {
  chat: { base: 'tenda/chat', authorize: authorizeChatUpload },
  dispute: { base: 'tenda/dispute', authorize: authorizeDisputeUpload },
}

/** Sender-scoped folder path for a stored upload: `<base>/<scopeId>/<userId>`. */
export function scopedUploadFolder(
  type: ScopedUploadType,
  scopeId: string,
  userId: string,
): string {
  return `${SCOPED_UPLOADS[type].base}/${scopeId}/${userId}`
}

/**
 * Strict attachment-URL check: parsed (query strings can't fake a match),
 * hostname pinned to Cloudinary, and the PATH must contain the sender-scoped
 * folder — so a signature minted for one scope cannot be replayed into
 * another (a different conversation, escrow, or user).
 */
export function isValidScopedAttachmentUrl(
  type: ScopedUploadType,
  url: string,
  scopeId: string,
  userId: string,
): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return false
  return parsed.pathname.includes(`/${scopedUploadFolder(type, scopeId, userId)}/`)
}

/** Authorize a scoped upload before a signature is issued (throws on denial). */
export function authorizeScopedUpload(
  db: AppDatabase,
  type: ScopedUploadType,
  caller: UploadCaller,
  scopeId: string,
): Promise<void> {
  return SCOPED_UPLOADS[type].authorize(db, caller, scopeId)
}
