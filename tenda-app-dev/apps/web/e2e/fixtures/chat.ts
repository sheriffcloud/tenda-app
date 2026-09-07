/**
 * Chat world for the e2e stub: one seeded conversation with Bola (2 unread)
 * whose message log GROWS on POST, so the send flow can assert the
 * optimistic bubble being confirmed by the server copy. Typed against the
 * real wire types — drift breaks the build here.
 */
import type { Conversation, Message } from '@tenda/shared'
import { EXISTING_USER_ID } from './auth'

export const OTHER_USER_ID = 'user-bola-1'

interface ChatWorld {
  conversation: Conversation
  messages: Message[]
  nextId: number
}

/**
 * Restore the seeded state in place. Called by the stub's /__e2e/reset-chat
 * before every chat test: CI retries (retries: 2) re-run a test against a
 * world its first attempt already mutated — without a reset, every retry
 * fails on state it inherited rather than the regression it retried for.
 */
export function resetChatWorld(world: ChatWorld): void {
  Object.assign(world, createChatWorld())
}

export function createChatWorld(): ChatWorld {
  const conversation: Conversation = {
    id: 'conv-1',
    user_a_id: EXISTING_USER_ID,
    user_b_id: OTHER_USER_ID,
    status: 'active',
    closed_by: null,
    closed_at: null,
    last_message_at: '2026-08-15T10:00:00.000Z',
    created_at: '2026-08-01T10:00:00.000Z',
    other_user: { id: OTHER_USER_ID, first_name: 'Bola', last_name: 'Ade', avatar_url: null },
    unread_count: 2,
    last_message: 'Are you still available tomorrow?',
  }
  return {
    conversation,
    messages: [
      {
        id: 'msg-2',
        conversation_id: 'conv-1',
        sender_id: OTHER_USER_ID,
        escrow_id: null,
        escrow_title: null,
        escrow_kind: null,
        content: 'Are you still available tomorrow?',
        read_at: null,
        created_at: '2026-08-15T10:00:00.000Z',
        attachment_url: null,
        attachment_type: null,
        attachment_size: null,
      },
      {
        id: 'msg-1',
        conversation_id: 'conv-1',
        sender_id: OTHER_USER_ID,
        escrow_id: 'gig-delivery-1',
        escrow_title: 'Deliver documents downtown',
        escrow_kind: 'gig',
        content: 'Hi! I saw your gig posting.',
        read_at: null,
        created_at: '2026-08-14T09:00:00.000Z',
        attachment_url: null,
        attachment_type: null,
        attachment_size: null,
      },
    ],
    nextId: 3,
  }
}

interface SendBody {
  content?: string
  escrow_id?: string
  attachment_url?: string
  attachment_type?: 'image' | 'file'
  attachment_size?: number
}

/** Chat routes; returns null when the URL is not chat's. */
export function handleChat(
  chat: ChatWorld,
  url: URL,
  method: string,
  senderId: string,
  body: string,
): { statusCode: number; payload: unknown } | null {
  if (url.pathname === '/v1/conversations' && method === 'GET') {
    // Server fidelity, twice over. The list serves ACTIVE conversations only —
    // a closed thread leaves the inbox until findOrCreate reopens it — and it
    // serves only the CALLER's, which the real route enforces by participant
    // pair. Without the second rule this stub hands the seeded thread to any
    // bearer, and a test asking "does account B see account A's inbox?" gets a
    // yes from the fixture rather than from the app.
    const mine =
      chat.conversation.user_a_id === senderId || chat.conversation.user_b_id === senderId
    return {
      statusCode: 200,
      payload: mine && chat.conversation.status === 'active' ? [chat.conversation] : [],
    }
  }
  if (url.pathname === '/v1/conversations' && method === 'POST') {
    // findOrCreate is also the reopen path.
    chat.conversation = { ...chat.conversation, status: 'active' }
    return { statusCode: 200, payload: chat.conversation }
  }
  if (url.pathname === `/v1/conversations/${chat.conversation.id}/messages` && method === 'GET') {
    // Read marks the thread read, like the real route.
    chat.conversation = { ...chat.conversation, unread_count: 0 }
    return { statusCode: 200, payload: chat.messages } // newest-first already
  }
  if (url.pathname === `/v1/conversations/${chat.conversation.id}/messages` && method === 'POST') {
    const input = JSON.parse(body) as SendBody
    const message: Message = {
      id: `msg-${chat.nextId++}`,
      conversation_id: chat.conversation.id,
      sender_id: senderId,
      escrow_id: input.escrow_id ?? null,
      escrow_title: null,
      escrow_kind: null,
      content: input.content ?? '',
      read_at: null,
      created_at: new Date().toISOString(),
      attachment_url: input.attachment_url ?? null,
      attachment_type: input.attachment_type ?? null,
      attachment_size: input.attachment_size ?? null,
    }
    chat.messages = [message, ...chat.messages]
    chat.conversation = {
      ...chat.conversation,
      last_message: message.content,
      last_message_at: message.created_at,
    }
    return { statusCode: 200, payload: message }
  }
  if (url.pathname === `/v1/conversations/${chat.conversation.id}/close` && method === 'POST') {
    chat.conversation = { ...chat.conversation, status: 'closed' }
    return { statusCode: 200, payload: chat.conversation }
  }
  if (url.pathname === `/v1/users/${OTHER_USER_ID}` && method === 'GET') {
    return {
      statusCode: 200,
      payload: {
        id: OTHER_USER_ID,
        first_name: 'Bola',
        last_name: 'Ade',
        bio: null,
        avatar_url: null,
        country: 'NG',
        city: 'Lagos',
        latitude: null,
        longitude: null,
        role: 'user',
        is_seeker: false,
        review_score: null,
        phone_verified_at: null,
        created_at: '2026-08-01T10:00:00.000Z',
      },
    }
  }
  return null
}
