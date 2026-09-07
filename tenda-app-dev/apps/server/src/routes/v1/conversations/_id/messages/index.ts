import { FastifyPluginAsync } from 'fastify'
import { uuidParamGuard } from '@server/lib/guards'
import { clampLimit } from '@server/lib/pagination'
import { and, eq, lt, lte, or, desc, isNull, ne, sql, type SQL } from 'drizzle-orm'
import { conversations, messages, escrows, gig_details, exchange_details } from '@tenda/shared/db/schema'
import { ErrorCode, MESSAGE_MAX_LENGTH } from '@tenda/shared'
import { appEvents } from '@server/lib/events'
import { AppError, requireBody } from '@server/lib/errors'
import { validateMessageAttachment } from '@server/lib/uploads/validate-attachment'
import { channelName } from '@server/lib/ws'
import { messagePreview } from '@server/lib/chat'
import type { ConversationsContract, ApiError } from '@tenda/shared'

type GetMessagesRoute = ConversationsContract['messages']
type SendMessageRoute = ConversationsContract['sendMessage']

const MESSAGES_PAGE_SIZE = 30

/**
 * Context-divider label for a referenced escrow: the gig title for gigs,
 * a trade summary for exchanges (which have no title).
 */
const escrowTitleSql: SQL<string | null> = sql<string | null>`CASE
  WHEN ${gig_details.title} IS NOT NULL THEN ${gig_details.title}
  WHEN ${exchange_details.escrow_id} IS NOT NULL
    THEN 'Trade: ' || ${exchange_details.fiat_amount}::text || ' ' || ${exchange_details.fiat_currency}
  ELSE NULL
END`

const messagesRoute: FastifyPluginAsync = async (fastify) => {
  // Malformed `:id` reaches postgres as a uuid comparison and throws;
  // answer it the way an unknown id is already answered.
  fastify.addHook('preHandler', uuidParamGuard('Conversation not found'))

  /** Resolve the context-divider title + kind for one escrow id (post-insert path). */
  async function escrowContextFor(
    escrow_id: string,
  ): Promise<{ title: string | null; kind: 'gig' | 'exchange' | null }> {
    const [row] = await fastify.db
      .select({ title: escrowTitleSql, kind: escrows.kind })
      .from(escrows)
      .leftJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
      .leftJoin(exchange_details, eq(exchange_details.escrow_id, escrows.id))
      .where(eq(escrows.id, escrow_id))
      .limit(1)
    return { title: row?.title ?? null, kind: row?.kind ?? null }
  }

  // GET /v1/conversations/:id/messages, paginated message history (cursor-based, newest first)
  fastify.get<{
    Params: GetMessagesRoute['params']
    Querystring: GetMessagesRoute['query']
    Reply: GetMessagesRoute['response'] | ApiError
  }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const { id } = request.params
      const { before_id, limit = MESSAGES_PAGE_SIZE } = request.query ?? {}
      const userId = request.user.id

      const [conv] = await fastify.db
        .select({ id: conversations.id, user_a_id: conversations.user_a_id, user_b_id: conversations.user_b_id })
        .from(conversations)
        .where(eq(conversations.id, id))
        .limit(1)

      if (!conv) throw new AppError(404, ErrorCode.NOT_FOUND, 'Conversation not found')
      if (conv.user_a_id !== userId && conv.user_b_id !== userId) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Not a participant of this conversation')
      }

      const pageSize = clampLimit(Number(limit) || MESSAGES_PAGE_SIZE)

      let cursorCreatedAt: Date | undefined
      if (before_id) {
        const [cursorMsg] = await fastify.db
          .select({ created_at: messages.created_at })
          .from(messages)
          .where(and(eq(messages.id, before_id), eq(messages.conversation_id, id)))
          .limit(1)
        if (cursorMsg?.created_at) cursorCreatedAt = cursorMsg.created_at
      }

      // Compound cursor: (created_at < X) OR (created_at = X AND id < before_id)
      // Prevents gaps when two messages share the same timestamp.
      const cursorCondition = cursorCreatedAt
        ? or(
            lt(messages.created_at, cursorCreatedAt),
            and(lte(messages.created_at, cursorCreatedAt), lt(messages.id, before_id!)),
          )!
        : undefined

      const rows = await fastify.db
        .select({
          id: messages.id,
          conversation_id: messages.conversation_id,
          sender_id: messages.sender_id,
          escrow_id: messages.escrow_id,
          escrow_title: escrowTitleSql,
          escrow_kind: escrows.kind,
          content: messages.content,
          attachment_url: messages.attachment_url,
          attachment_type: messages.attachment_type,
          attachment_size: messages.attachment_size,
          read_at: messages.read_at,
          created_at: messages.created_at,
        })
        .from(messages)
        .leftJoin(escrows, eq(messages.escrow_id, escrows.id))
        .leftJoin(gig_details, eq(gig_details.escrow_id, escrows.id))
        .leftJoin(exchange_details, eq(exchange_details.escrow_id, escrows.id))
        .where(
          cursorCondition
            ? and(eq(messages.conversation_id, id), cursorCondition)
            : eq(messages.conversation_id, id)
        )
        .orderBy(desc(messages.created_at))
        .limit(pageSize)

      // Mark all unread messages from the other user as read (not just this page).
      // Awaited so the badge clears reliably before the response returns.
      // @scalability: replace with a dedicated POST /v1/conversations/:id/read endpoint
      // (client-driven explicit read receipt) when per-message granularity or
      // read-only GET caching becomes a requirement.
      await fastify.db
        .update(messages)
        .set({ read_at: new Date() })
        .where(
          and(
            eq(messages.conversation_id, id),
            ne(messages.sender_id, userId),
            isNull(messages.read_at),
          )
        )

      return rows.map((m) => ({
        ...m,
        escrow_title: m.escrow_title ?? null,
        escrow_kind: m.escrow_kind ?? null,
        read_at: m.read_at?.toISOString() ?? null,
        created_at: m.created_at.toISOString(),
      }))
    },
  )

  // POST /v1/conversations/:id/messages, send a message
  fastify.post<{
    Params: SendMessageRoute['params']
    Body: SendMessageRoute['body']
    Reply: SendMessageRoute['response'] | ApiError
  }>(
    '/',
    // Chat-message moderation is report-driven (stage-6 scope decision),
    // the legacy keyword guard died with blocked_keywords at the cutover.
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params
      const { content, escrow_id, attachment_url, attachment_type, attachment_size } = requireBody(request.body)
      const userId = request.user.id

      // S5.2: attachment validation, all three fields together or none; URL
      // must live under THIS conversation's sender-scoped folder so a
      // signature minted for one conversation can't be replayed in another.
      const attachment = validateMessageAttachment(
        { attachment_url, attachment_type, attachment_size },
        { type: 'chat', scopeId: id, userId },
      )

      const trimmed = (content ?? '').trim()
      // Attachment-only messages carry empty content.
      if (trimmed.length === 0 && attachment === null) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'content is required')
      if (trimmed.length > MESSAGE_MAX_LENGTH) throw new AppError(400, ErrorCode.VALIDATION_ERROR, `Message content must be at most ${MESSAGE_MAX_LENGTH} characters`)

      // Context references must resolve, a bad id would otherwise surface
      // as an FK violation (500) instead of a client error.
      if (escrow_id !== undefined) {
        const [referenced] = await fastify.db
          .select({ id: escrows.id })
          .from(escrows)
          .where(eq(escrows.id, escrow_id))
          .limit(1)
        if (referenced === undefined) {
          throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'escrow_id does not reference an existing escrow')
        }
      }

      const [conv] = await fastify.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, id))
        .limit(1)

      if (!conv) throw new AppError(404, ErrorCode.NOT_FOUND, 'Conversation not found')
      if (conv.user_a_id !== userId && conv.user_b_id !== userId) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Not a participant of this conversation')
      }

      // Pre-check outside the transaction for a fast path, but the definitive
      // check is inside the transaction with a row lock to guard against concurrent closes.
      if (conv.status === 'closed') throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'This conversation has been closed')

      const newMessage = await fastify.db.transaction(async (tx) => {
        // Re-read with FOR UPDATE to prevent a concurrent close from racing the INSERT.
        const [current] = await tx
          .select({ status: conversations.status })
          .from(conversations)
          .where(eq(conversations.id, id))
          .for('update')
          .limit(1)

        if (!current || current.status === 'closed') return null

        const [msg] = await tx
          .insert(messages)
          .values({
            conversation_id: id,
            sender_id: userId,
            escrow_id: escrow_id ?? null,
            content: trimmed,
            attachment_url: attachment?.attachment_url ?? null,
            attachment_type: attachment?.attachment_type ?? null,
            attachment_size: attachment?.attachment_size ?? null,
          })
          .returning()

        await tx
          .update(conversations)
          .set({ last_message_at: new Date() })
          .where(eq(conversations.id, id))

        return msg
      })

      if (!newMessage) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'This conversation has been closed')

      const context =
        newMessage.escrow_id === null
          ? { title: null, kind: null }
          : await escrowContextFor(newMessage.escrow_id)

      const recipientId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id
      const preview = messagePreview(trimmed, attachment !== null) ?? ''

      appEvents.emit('message.sent', {
        conversationId: id,
        senderId: userId,
        recipientId,
        preview,
      })

      const serialized = {
        ...newMessage,
        escrow_title: context.title,
        escrow_kind: context.kind,
        read_at: newMessage.read_at?.toISOString() ?? null,
        created_at: newMessage.created_at.toISOString(),
      }

      // Live fan-out to open chat screens. Reaches the sender's own socket
      // too, the client dedupes by message id against its optimistic copy.
      fastify.realtime.publish({
        channel: channelName({ kind: 'chat', id }),
        type: 'message',
        message: serialized,
      })
      // Mirror onto the recipient's user channel so the inbox / unread
      // badge updates without the conversation screen being open.
      fastify.realtime.publish({
        channel: channelName({ kind: 'user', id: recipientId }),
        type: 'message',
        message: serialized,
      })

      return reply.code(201).send(serialized)
    },
  )
}

export default messagesRoute
