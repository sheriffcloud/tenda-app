import { FastifyPluginAsync } from 'fastify'
import { uuidParamGuard } from '@server/lib/guards'
import { eq } from 'drizzle-orm'
import { conversations } from '@tenda/shared/db/schema'
import { ErrorCode } from '@tenda/shared'
import type { ConversationsContract, ApiError } from '@tenda/shared'
import { AppError } from '@server/lib/errors'

type CloseRoute = ConversationsContract['close']

const closeConversation: FastifyPluginAsync = async (fastify) => {
  // Malformed `:id` reaches postgres as a uuid comparison and throws;
  // answer it the way an unknown id is already answered.
  fastify.addHook('preHandler', uuidParamGuard('Conversation not found'))

  // POST /v1/conversations/:id/close, close a conversation (hide it from inbox)
  fastify.post<{
    Params: CloseRoute['params']
    Reply: CloseRoute['response'] | ApiError
  }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const { id } = request.params
      const userId = request.user.id

      const [conv] = await fastify.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, id))
        .limit(1)

      if (!conv) throw new AppError(404, ErrorCode.NOT_FOUND, 'Conversation not found')
      if (conv.user_a_id !== userId && conv.user_b_id !== userId) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Not a participant of this conversation')
      }

      const otherId = conv.user_a_id === userId ? conv.user_b_id : conv.user_a_id

      if (conv.status === 'closed') {
        return {
          ...conv,
          closed_at:       conv.closed_at?.toISOString() ?? null,
          last_message_at: conv.last_message_at?.toISOString() ?? null,
          created_at:      conv.created_at?.toISOString() ?? null,
          other_user:      { id: otherId, first_name: null, last_name: null, avatar_url: null },
          unread_count:    0,
          last_message:    null,
        }
      }

      const [updated] = await fastify.db
        .update(conversations)
        .set({ status: 'closed', closed_by: userId, closed_at: new Date() })
        .where(eq(conversations.id, id))
        .returning()

      return {
        ...updated,
        closed_at:       updated.closed_at?.toISOString() ?? null,
        last_message_at: updated.last_message_at?.toISOString() ?? null,
        created_at:      updated.created_at?.toISOString() ?? null,
        other_user:      { id: otherId, first_name: null, last_name: null, avatar_url: null },
        unread_count:    0,
        last_message:    null,
      }
    },
  )
}

export default closeConversation
