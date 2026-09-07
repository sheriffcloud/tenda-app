/**
 * Everything that reaches the user directly: conversations, the in-app
 * notification centre, device tokens, and the new-gig subscriptions that feed
 * it.
 */
import {
  apiRoutes,
  type Conversation,
  type GigSubscription,
  type Message,
  type MessagesQuery,
  type NotificationFeed,
  type NotificationsQuery,
  type RegisterDeviceTokenInput,
  type SendMessageInput,
  type UpsertSubscriptionInput,
} from '@tenda/shared'
import { request } from '../request'

const { conversations, notifications, subscriptions } = apiRoutes

export const conversationsApi = {
  list: () => request<Conversation[]>('GET', conversations.list),
  findOrCreate: (body: { user_id: string }) =>
    request<Conversation>('POST', conversations.findOrCreate, { body }),
  messages: (params: { id: string }, query?: MessagesQuery) =>
    request<Message[]>('GET', conversations.messages, { params, query }),
  sendMessage: (params: { id: string }, body: SendMessageInput) =>
    request<Message>('POST', conversations.sendMessage, { params, body }),
  close: (params: { id: string }) =>
    request<Conversation>('POST', conversations.close, { params }),
}

export const notificationsApi = {
  registerToken: (body: RegisterDeviceTokenInput) =>
    request<{ ok: boolean }>('POST', notifications.registerToken, { body }),
  removeToken: (body: { token: string }) =>
    request<{ ok: boolean }>('DELETE', notifications.registerToken, { body }),
  // In-app notification centre (Stage 5).
  feed: (query?: NotificationsQuery) =>
    request<NotificationFeed>('GET', notifications.list, { query }),
  unreadCount: () => request<{ count: number }>('GET', notifications.unreadCount),
  markRead: (params: { id: string }) =>
    request<{ ok: boolean }>('POST', notifications.markRead, { params }),
  markAllRead: () => request<{ ok: boolean }>('POST', notifications.markAllRead),
}

export const subscriptionsApi = {
  list: () => request<GigSubscription[]>('GET', subscriptions.list),
  upsert: (body: UpsertSubscriptionInput) =>
    request<GigSubscription>('POST', subscriptions.upsert, { body }),
  remove: (params: { id: string }) =>
    request<{ ok: boolean }>('DELETE', subscriptions.remove, { params }),
}
