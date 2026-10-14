/**
 * Wire-shaped chat rows for the store suites, and the reset they share.
 *
 * The rows are complete by default and overridable field by field, so a case
 * states only what it is about. Every field is spelled out rather than cast:
 * the store reads `attachment_*` as a nullable GROUP and `content` for the
 * inbox preview, and a fixture that quietly omitted one would let a case pass
 * against a shape the server cannot send.
 *
 * The reset lives here rather than in each suite because it is a RULE about
 * the store, and a rule written in two files is a rule that drifts.
 */
import type { Conversation, Message } from '@tenda/shared'
import { useChatStore, type LocalMessage } from '@/stores/chat.store'

// Captured at import, before any case can touch the store. Restoring this
// wholesale is complete by construction; a hand-listed
// `setState({ conversations: [], messages: {}, unread: 0 })` is complete only
// until someone adds a fourth field, which is how web's version of these
// suites let `conversationsStatus` leak between cases.
const PRISTINE = useChatStore.getState()

/** Put the chat store back exactly as the module defined it. */
export function resetChatStore(): void {
  useChatStore.setState(PRISTINE, true)
}

export function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id:              'c1',
    user_a_id:       'me',
    user_b_id:       'them',
    status:          'active',
    closed_by:       null,
    closed_at:       null,
    last_message:    'previously',
    last_message_at: '2026-08-19T09:00:00.000Z',
    created_at:      '2026-08-19T08:00:00.000Z',
    other_user:      { id: 'them', first_name: 'Ada', last_name: 'Lovelace', avatar_url: null },
    unread_count:    0,
    ...overrides,
  }
}

export function message(overrides: Partial<Message> = {}): Message {
  return {
    id:              'm1',
    conversation_id: 'c1',
    sender_id:       'them',
    escrow_id:       null,
    escrow_title:    null,
    escrow_kind:     null,
    content:         'hello',
    attachment_url:  null,
    attachment_type: null,
    attachment_size: null,
    read_at:         null,
    created_at:      '2026-08-19T09:00:00.000Z',
    ...overrides,
  }
}

/** A message the store is holding optimistically, in one of its three states. */
export function localMessage(overrides: Partial<LocalMessage> = {}): LocalMessage {
  return { ...message(), _status: 'sending', ...overrides }
}
