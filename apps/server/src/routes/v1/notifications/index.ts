import { FastifyPluginAsync } from 'fastify'
import { loadViewer, loadFeed, countUnread } from '@server/lib/notifications-read'
import type { NotificationsContract, NotificationFeed, ApiError } from '@tenda/shared'

type ListRoute = NotificationsContract['list']
type UnreadRoute = NotificationsContract['unreadCount']

const EMPTY_FEED: NotificationFeed = { notifications: [], announcements: [], unread_count: 0 }

const notificationsRead: FastifyPluginAsync = async (fastify) => {
  // GET /v1/notifications — personal feed + targeted announcements + unread count.
  fastify.get<{
    Querystring: ListRoute['query']
    Reply: ListRoute['response'] | ApiError
  }>('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const viewer = await loadViewer(fastify.db, request.user.id)
    // A valid JWT for a since-deleted user (rows cascade-gone) → empty, not 500.
    if (viewer === null) return EMPTY_FEED
    return loadFeed(fastify.db, viewer, request.query ?? {}, new Date())
  })

  // GET /v1/notifications/unread-count — lightweight badge poll.
  fastify.get<{
    Reply: UnreadRoute['response'] | ApiError
  }>('/unread-count', { preHandler: [fastify.authenticate] }, async (request) => {
    const viewer = await loadViewer(fastify.db, request.user.id)
    if (viewer === null) return { count: 0 }
    return { count: await countUnread(fastify.db, viewer, new Date()) }
  })
}

export default notificationsRead
