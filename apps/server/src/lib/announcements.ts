/**
 * Announcement write path — the single place a broadcast is created, shared by
 * the admin announcement CRUD (`admin/announcements`) and the admin push
 * broadcast (`admin/push`). A broadcast lives ONCE in `announcements` (fan-out
 * on read, see lib/notifications-read); it is never written as N per-user rows.
 *
 * `createAnnouncement(db, input, { push })` persists the row and, when `push`
 * is set, resolves the audience's device tokens and fires a best-effort push —
 * so an admin push is both delivered live AND readable in-app afterwards.
 */

import { eq, inArray } from 'drizzle-orm'
import { announcements, device_tokens, users } from '@tenda/shared/db/schema'
import { ANNOUNCEMENT_TARGETS, ErrorCode } from '@tenda/shared'
import type { AnnouncementTarget, UserRole } from '@tenda/shared'
import { AppError } from '@server/lib/errors'
import { sendPush } from '@server/lib/push'
import type { AppDatabase } from '@server/plugins/db'

type AnnouncementRow = typeof announcements.$inferSelect
/** The logger shape sendPush needs — derived so it can't drift from the source. */
type PushLog = Parameters<typeof sendPush>[2]

export interface NormalizedTarget {
  target: AnnouncementTarget | null
  target_value: string | null
}

/**
 * Normalize an admin-supplied audience into the stored shape: 'all' (or an
 * absent target) collapses to NULL = everyone; a concrete target requires a
 * non-empty target_value. Throws a 400 on a bad combination so both admin
 * routes validate targeting identically.
 */
export function normalizeTarget(
  target: string | null | undefined,
  target_value: string | null | undefined,
): NormalizedTarget {
  if (target === undefined || target === null || target === 'all') {
    return { target: null, target_value: null }
  }
  if (!ANNOUNCEMENT_TARGETS.includes(target as AnnouncementTarget)) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `target must be one of: all, ${ANNOUNCEMENT_TARGETS.join(', ')}`,
    )
  }
  const value = target_value?.trim()
  if (!value) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, `target_value is required when target is "${target}"`)
  }
  return { target: target as AnnouncementTarget, target_value: value }
}

/** Device tokens for an announcement audience (NULL target = everyone). */
export async function resolveAudienceTokens(
  db: AppDatabase,
  target: AnnouncementTarget | null,
  target_value: string | null,
): Promise<string[]> {
  if (target === null) {
    const rows = await db.select({ token: device_tokens.token }).from(device_tokens)
    return rows.map((r) => r.token)
  }
  if (target_value === null) return []

  let userRows: { id: string }[]
  if (target === 'role') {
    userRows = await db.select({ id: users.id }).from(users).where(eq(users.role, target_value as UserRole))
  } else if (target === 'country') {
    userRows = await db.select({ id: users.id }).from(users).where(eq(users.country, target_value))
  } else {
    userRows = await db.select({ id: users.id }).from(users).where(eq(users.city, target_value))
  }
  const userIds = userRows.map((r) => r.id)
  if (userIds.length === 0) return []

  const tokenRows = await db
    .select({ token: device_tokens.token })
    .from(device_tokens)
    .where(inArray(device_tokens.user_id, userIds))
  return tokenRows.map((r) => r.token)
}

export interface CreateAnnouncementInput {
  title: string
  body: string
  priority: number
  is_active: boolean
  target: AnnouncementTarget | null
  target_value: string | null
  /** null = never expires. Push broadcasts pass a TTL so they self-retire. */
  expires_at: Date | null
  created_by: string
}

export interface CreateAnnouncementOptions {
  /** Also push to the audience's devices. Requires `log`; no-op if inactive. */
  push?: boolean
  /** Deep-link payload for the push only (announcements carry no data column). */
  pushData?: Record<string, unknown>
  log?: PushLog
}

export interface CreateAnnouncementResult {
  announcement: AnnouncementRow
  /** Number of device tokens the push was attempted against (0 when push is off). */
  push_attempted: number
}

/** Persist a broadcast (one row) and, if requested, push it to its audience. */
export async function createAnnouncement(
  db: AppDatabase,
  input: CreateAnnouncementInput,
  opts: CreateAnnouncementOptions = {},
): Promise<CreateAnnouncementResult> {
  const [announcement] = await db
    .insert(announcements)
    .values({
      title: input.title,
      body: input.body,
      priority: input.priority,
      is_active: input.is_active,
      target: input.target,
      target_value: input.target_value,
      // published_at is the visibility/cursor key — stamped once, only when active.
      published_at: input.is_active ? new Date() : null,
      expires_at: input.expires_at,
      created_by: input.created_by,
    })
    .returning()

  let push_attempted = 0
  if (opts.push && input.is_active && opts.log) {
    const tokens = await resolveAudienceTokens(db, input.target, input.target_value)
    if (tokens.length > 0) {
      const stale = await sendPush(
        tokens,
        { title: input.title, body: input.body, ...(opts.pushData ? { data: opts.pushData } : {}) },
        opts.log,
      )
      if (stale.length > 0) {
        await db.delete(device_tokens).where(inArray(device_tokens.token, stale))
      }
      push_attempted = tokens.length
    }
  }

  return { announcement: announcement!, push_attempted }
}
