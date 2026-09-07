import { FastifyPluginAsync } from 'fastify'
import { uuidParamGuard } from '@server/lib/guards'
import { and, eq } from 'drizzle-orm'
import { gig_subscriptions } from '@tenda/shared/db/schema'
import { ErrorCode, MAX_PAGINATION_LIMIT } from '@tenda/shared'
import { isPostgresUniqueViolation } from '@server/lib/db'
import { AppError } from '@server/lib/errors'
import type { SubscriptionsContract, ApiError } from '@tenda/shared'

type ListRoute = SubscriptionsContract['list']
type UpsertRoute = SubscriptionsContract['upsert']
type RemoveRoute = SubscriptionsContract['remove']

const subscriptions: FastifyPluginAsync = async (fastify) => {
  // Malformed `:id` reaches postgres as a uuid comparison and throws;
  // answer it the way an unknown id is already answered.
  fastify.addHook('preHandler', uuidParamGuard('Subscription not found'))

  // GET /v1/subscriptions, list user's gig subscriptions
  fastify.get<{
    Reply: ListRoute['response'] | ApiError
  }>(
    '/',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const rows = await fastify.db
        .select()
        .from(gig_subscriptions)
        .where(eq(gig_subscriptions.user_id, request.user.id))
        .limit(MAX_PAGINATION_LIMIT)

      return rows.map((r) => ({
        ...r,
        created_at: r.created_at?.toISOString() ?? null,
      }))
    },
  )

  // POST /v1/subscriptions, add or update a subscription
  fastify.post<{
    Body: UpsertRoute['body']
    Reply: UpsertRoute['response'] | ApiError
  }>(
    '/',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.id
      const city     = request.body.city     ?? '*'
      const category = request.body.category ?? '*'

      try {
        const [row] = await fastify.db
          .insert(gig_subscriptions)
          .values({ user_id: userId, city, category })
          .onConflictDoUpdate({
            target: [gig_subscriptions.user_id, gig_subscriptions.city, gig_subscriptions.category],
            set: { city, category },
          })
          .returning()

        return reply.code(201).send({
          ...row,
          created_at: row.created_at?.toISOString() ?? null,
        })
      } catch (err) {
        if (isPostgresUniqueViolation(err)) {
          const [existing] = await fastify.db
            .select()
            .from(gig_subscriptions)
            .where(
              and(
                eq(gig_subscriptions.user_id, userId),
                eq(gig_subscriptions.city, city),
                eq(gig_subscriptions.category, category),
              )
            )
            .limit(1)
          return reply.code(200).send({
            ...existing,
            created_at: existing.created_at?.toISOString() ?? null,
          })
        }
        throw err
      }
    },
  )

  // DELETE /v1/subscriptions/:id, remove a subscription
  fastify.delete<{
    Params: RemoveRoute['params']
    Reply: RemoveRoute['response'] | ApiError
  }>(
    '/:id',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const { id } = request.params
      const userId = request.user.id

      const deleted = await fastify.db
        .delete(gig_subscriptions)
        .where(and(eq(gig_subscriptions.id, id), eq(gig_subscriptions.user_id, userId)))
        .returning({ id: gig_subscriptions.id })

      if (deleted.length === 0) throw new AppError(404, ErrorCode.NOT_FOUND, 'Subscription not found')

      return { ok: true }
    },
  )
}

export default subscriptions
