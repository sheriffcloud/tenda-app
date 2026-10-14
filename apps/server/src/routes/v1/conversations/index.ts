import { FastifyPluginAsync } from 'fastify'
import { and, eq, or, ne, desc, inArray, isNull, isNotNull, lt, sql, type SQL } from 'drizzle-orm'
import { conversations, messages, users } from '@tenda/shared/db/schema'
import { ErrorCode, INBOX_PAGE_SIZE } from '@tenda/shared'
import type { ConversationsContract, ApiError, Conversation } from '@tenda/shared'
import { isPostgresUniqueViolation } from '@server/lib/errors/pg'
import { messagePreview } from '@server/lib/http/chat'
import { AppError, requireBody } from '@server/lib/errors'
import { clampLimit } from '@server/lib/http/pagination'
import { isUuidLike } from '@server/lib/http/uuid'

type ListRoute       = ConversationsContract['list']
type FindOrCreateRoute = ConversationsContract['findOrCreate']

/**
 * The rows AFTER a cursor, in the inbox's order: `last_message_at DESC` (rows
 * with no message yet sort FIRST, Postgres' default for DESC), then `id DESC`.
 *
 * Both halves are needed. Several conversations can share a `last_message_at`,
 * so the timestamp alone skips or repeats rows at a page boundary; and the
 * column is NULLABLE, so a plain `<` would drop the whole not-yet-messaged group
 * (NULL < x is never true) and, from inside that group, never reach the rest.
 *
 * The cursor's timestamp arrives as TEXT and is cast back in SQL. Round-tripping
 * it through a JS Date would cut it to milliseconds while the column holds
 * microseconds, and a sibling that differs only below the millisecond would fall
 * on the wrong side of the comparison and never be returned.
 */
function afterCursor(cursor: { id: string; last_message_at_text: string | null }): SQL | undefined {
  if (cursor.last_message_at_text === null) {
    return or(
      and(isNull(conversations.last_message_at), lt(conversations.id, cursor.id)),
      isNotNull(conversations.last_message_at),
    )
  }
  const at = sql`${cursor.last_message_at_text}::timestamptz`
  return or(
    sql`${conversations.last_message_at} < ${at}`,
    and(sql`${conversations.last_message_at} = ${at}`, lt(conversations.id, cursor.id)),
  )
}

/** Sort two UUIDs so user_a_id < user_b_id (canonical order). */
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

const conversationsRoute: FastifyPluginAsync = async (fastify) => {
  // GET /v1/conversations, list conversations for the authenticated user
  //   ?before_id=<id of the last conversation you hold>&limit=<page size>
  // With neither, the newest INBOX_PAGE_SIZE, exactly as before; a
  // client that never pages is unaffected. A full page may be followed by more.
  fastify.get<{
    Querystring: ListRoute['query']
    Reply: ListRoute['response'] | ApiError
  }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request, _reply) => {
      const userId = request.user.id
      const { before_id, limit } = request.query ?? {}
      const pageSize = clampLimit(Number(limit) || INBOX_PAGE_SIZE)

      // The cursor must be one of the CALLER's conversations: anything else is
      // "not found" rather than a timestamp read off someone else's chat. A
      // CLOSED one is fine — it can drop out of the list between two pages and
      // still be the place the client stopped at.
      let after: SQL | undefined
      if (before_id) {
        if (!isUuidLike(before_id)) {
          throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'before_id must be a conversation id')
        }
        const [cursor] = await fastify.db
          .select({ id: conversations.id, last_message_at_text: sql<string | null>`${conversations.last_message_at}::text` })
          .from(conversations)
          .where(and(
            eq(conversations.id, before_id),
            or(eq(conversations.user_a_id, userId), eq(conversations.user_b_id, userId)),
          ))
          .limit(1)
        if (cursor === undefined) throw new AppError(404, ErrorCode.NOT_FOUND, 'Conversation not found')
        after = afterCursor(cursor)
      }

      // 1. Fetch one page of conversations
      const rows = await fastify.db
        .select({
          id:              conversations.id,
          user_a_id:       conversations.user_a_id,
          user_b_id:       conversations.user_b_id,
          status:          conversations.status,
          closed_by:       conversations.closed_by,
          closed_at:       conversations.closed_at,
          last_message_at: conversations.last_message_at,
          created_at:      conversations.created_at,
        })
        .from(conversations)
        .where(
          and(
            or(eq(conversations.user_a_id, userId), eq(conversations.user_b_id, userId)),
            eq(conversations.status, 'active'),
            after,
          )
        )
        .orderBy(desc(conversations.last_message_at), desc(conversations.id))
        .limit(pageSize)

      if (rows.length === 0) return []

      const convIds  = rows.map((r) => r.id)
      const otherIds = rows.map((r) => r.user_a_id === userId ? r.user_b_id : r.user_a_id)

      // Queries 2–4 are independent reads, run in parallel.
      const [otherUsers, unreadRows, lastMsgRows] = await Promise.all([
        // 2. All other-user profiles in one IN query
        fastify.db
          .select({ id: users.id, first_name: users.first_name, last_name: users.last_name, avatar_url: users.avatar_url })
          .from(users)
          .where(inArray(users.id, otherIds)),

        // 3. Exact unread counts via SQL COUNT, no artificial cap
        fastify.db
          .select({
            conversation_id: messages.conversation_id,
            count: sql<number>`count(*)::int`,
          })
          .from(messages)
          .where(
            and(
              inArray(messages.conversation_id, convIds),
              ne(messages.sender_id, userId),
              isNull(messages.read_at),
            )
          )
          .groupBy(messages.conversation_id),

        // 4. Last message per conversation via DISTINCT ON
        fastify.db
          .selectDistinctOn([messages.conversation_id], {
            conversation_id: messages.conversation_id,
            content:         messages.content,
            attachment_url:  messages.attachment_url,
          })
          .from(messages)
          .where(inArray(messages.conversation_id, convIds))
          .orderBy(messages.conversation_id, desc(messages.created_at)),
      ])

      const otherUserMap = new Map(otherUsers.map((u) => [u.id, u]))
      const unreadMap    = new Map(unreadRows.map((r) => [r.conversation_id, r.count]))
      const lastMsgMap   = new Map(
        lastMsgRows.map((r) => [r.conversation_id, messagePreview(r.content, r.attachment_url !== null)]),
      )

      // Assemble the response, no additional DB calls
      const result: Conversation[] = rows.map((conv) => {
        const otherId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id
        const other   = otherUserMap.get(otherId)
        return {
          ...conv,
          closed_at:       conv.closed_at?.toISOString() ?? null,
          last_message_at: conv.last_message_at?.toISOString() ?? null,
          created_at:      conv.created_at.toISOString(),
          other_user: {
            id:         other?.id ?? otherId,
            first_name: other?.first_name ?? null,
            last_name:  other?.last_name ?? null,
            avatar_url: other?.avatar_url ?? null,
          },
          unread_count: unreadMap.get(conv.id) ?? 0,
          last_message: lastMsgMap.get(conv.id) ?? null,
        }
      })

      return result
    },
  )

  // POST /v1/conversations, find or create a conversation with another user
  fastify.post<{
    Body: FindOrCreateRoute['body']
    Reply: FindOrCreateRoute['response'] | ApiError
  }>(
    '/',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, preHandler: [fastify.authenticate] },
    async (request) => {
      const userId = request.user.id
      const { user_id: targetId } = requireBody(request.body)

      if (!targetId || typeof targetId !== 'string') throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'user_id is required')
      if (targetId === userId) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Cannot start a conversation with yourself')

      // Verify target user exists
      const [targetUser] = await fastify.db
        .select({ id: users.id, first_name: users.first_name, last_name: users.last_name, avatar_url: users.avatar_url })
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1)

      if (!targetUser) throw new AppError(404, ErrorCode.USER_NOT_FOUND, 'User not found')

      const [userA, userB] = canonicalPair(userId, targetId)

      // Try to find existing conversation (including closed ones, reopen on new contact)
      let [existing] = await fastify.db
        .select()
        .from(conversations)
        .where(and(eq(conversations.user_a_id, userA), eq(conversations.user_b_id, userB)))
        .limit(1)

      let isNew = false

      if (!existing) {
        isNew = true
        try {
          ;[existing] = await fastify.db
            .insert(conversations)
            .values({ user_a_id: userA, user_b_id: userB })
            .returning()
        } catch (err) {
          if (isPostgresUniqueViolation(err)) {
            // Race condition: another request created it simultaneously
            ;[existing] = await fastify.db
              .select()
              .from(conversations)
              .where(and(eq(conversations.user_a_id, userA), eq(conversations.user_b_id, userB)))
              .limit(1)
            isNew = false
          } else {
            throw err
          }
        }
      } else if (existing.status === 'closed') {
        // Reopen a closed conversation when a new contact is initiated
        ;[existing] = await fastify.db
          .update(conversations)
          .set({ status: 'active', closed_by: null, closed_at: null })
          .where(eq(conversations.id, existing.id))
          .returning()
      }

      // New conversations have no messages yet, skip the DB round-trips.
      // Existing and reopened conversations may have history and unread messages.
      let unread_count = 0
      let last_message: string | null = null

      if (!isNew) {
        const [unreadResult, lastMsgResult] = await Promise.all([
          fastify.db
            .select({ count: sql<number>`count(*)::int` })
            .from(messages)
            .where(and(
              eq(messages.conversation_id, existing.id),
              ne(messages.sender_id, userId),
              isNull(messages.read_at),
            )),
          fastify.db
            .selectDistinctOn([messages.conversation_id], { content: messages.content, attachment_url: messages.attachment_url })
            .from(messages)
            .where(eq(messages.conversation_id, existing.id))
            .orderBy(messages.conversation_id, desc(messages.created_at))
            .limit(1),
        ])
        unread_count = unreadResult[0]?.count ?? 0
        const lastMsg = lastMsgResult[0]
        last_message = lastMsg ? messagePreview(lastMsg.content, lastMsg.attachment_url !== null) : null
      }

      return {
        ...existing,
        closed_at:       existing.closed_at?.toISOString() ?? null,
        last_message_at: existing.last_message_at?.toISOString() ?? null,
        created_at:      existing.created_at.toISOString(),
        other_user: {
          id:         targetUser.id,
          first_name: targetUser.first_name,
          last_name:  targetUser.last_name,
          avatar_url: targetUser.avatar_url,
        },
        unread_count,
        last_message,
      }
    },
  )
}

export default conversationsRoute
