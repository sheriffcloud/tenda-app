import type { Conversation, Message } from '@tenda/shared'

/**
 * Fully-typed chat rows for tests and the e2e stub — typed against the
 * REAL shared wire types so a schema change breaks the build here, not
 * silently in fixtures that stopped matching.
 */
export function makeConversation(overrides: Partial<Conversation> & { id: string }): Conversation {
  return {
    user_a_id: 'me',
    user_b_id: 'them',
    status: 'active',
    closed_by: null,
    closed_at: null,
    last_message_at: '2026-08-15T10:00:00.000Z',
    created_at: '2026-08-01T10:00:00.000Z',
    other_user: { id: 'them', first_name: 'Ada', last_name: 'Okafor', avatar_url: null },
    unread_count: 0,
    last_message: 'hi',
    ...overrides,
  }
}

export function makeMessage(overrides: Partial<Message> & { id: string }): Message {
  return {
    conversation_id: 'c1',
    sender_id: 'them',
    escrow_id: null,
    escrow_title: null,
    escrow_kind: null,
    content: 'hello',
    read_at: null,
    created_at: '2026-08-15T10:00:00.000Z',
    attachment_url: null,
    attachment_type: null,
    attachment_size: null,
    ...overrides,
  }
}
