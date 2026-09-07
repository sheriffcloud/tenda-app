import { create } from 'zustand'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'
import type { UploadedAttachment } from '@/lib/attachments'
import { ATTACHMENT_PREVIEW, type Conversation, type Message } from '@tenda/shared'

// A message optimistically added before server confirmation
export type LocalMessage = Message & {
  _status?: 'sending' | 'sent' | 'failed'
}

/** The escrow (gig/exchange) a message is contextually attached to. */
export interface EscrowContext {
  escrowId: string
  kind: 'gig' | 'exchange' | null
}

interface ChatState {
  conversations:    Conversation[]
  messages:         Record<string, LocalMessage[]>   // conversationId → messages (oldest first)
  unread:           number                           // total unread across all conversations

  fetchConversations: () => Promise<void>
  findOrCreate:       (userId: string) => Promise<Conversation>
  fetchMessages:      (conversationId: string, beforeId?: string) => Promise<Message[]>
  sendMessage:        (conversationId: string, content: string, context?: EscrowContext, attachment?: UploadedAttachment) => Promise<void>
  retryMessage:       (conversationId: string, message: LocalMessage) => void
  closeConversation:  (conversationId: string) => Promise<void>
  appendMessage:      (conversationId: string, message: LocalMessage) => void
  receiveMessage:     (conversationId: string, message: Message) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages:      {},
  unread:        0,

  fetchConversations: async () => {
    const convs = await api.conversations.list()
    const unread = convs.reduce((sum, c) => sum + c.unread_count, 0)
    set({ conversations: convs, unread })
  },

  findOrCreate: async (userId) => {
    const conv = await api.conversations.findOrCreate({ user_id: userId })
    set((s) => {
      const exists = s.conversations.find((c) => c.id === conv.id)
      return {
        conversations: exists
          ? s.conversations.map((c) => (c.id === conv.id ? conv : c))
          : [conv, ...s.conversations],
      }
    })
    return conv
  },

  fetchMessages: async (conversationId, beforeId) => {
    const fetched = await api.conversations.messages({ id: conversationId }, beforeId ? { before_id: beforeId } : undefined)
    // Server returns newest-first; reverse for display (oldest first)
    const ordered = [...fetched].reverse()

    set((s) => {
      const existing = s.messages[conversationId] ?? []
      if (beforeId) {
        // Prepend older messages
        return { messages: { ...s.messages, [conversationId]: [...ordered, ...existing] } }
      }
      // Merge: preserve optimistic messages that aren't yet server-confirmed
      const optimistic = existing.filter((m) => m._status === 'sending')
      // Mark this conversation as read locally so the unread badge clears immediately
      // (the server marks messages read asynchronously on the same request)
      const conversations = s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c
      )
      const unread = conversations.reduce((sum, c) => sum + c.unread_count, 0)
      return {
        messages:      { ...s.messages, [conversationId]: [...ordered, ...optimistic] },
        conversations,
        unread,
      }
    })

    return fetched
  },

  sendMessage: async (conversationId, content, context, attachment) => {
    const tempId = `temp_${Date.now()}`
    const optimistic: LocalMessage = {
      id:              tempId,
      conversation_id: conversationId,
      sender_id:       useAuthStore.getState().user?.id ?? '',
      escrow_id:       context?.escrowId ?? null,
      escrow_title:    null,
      escrow_kind:     context?.kind ?? null,
      content,
      attachment_url:  attachment?.url  ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_size: attachment?.size ?? null,
      read_at:         null,
      created_at:      new Date().toISOString(),
      _status:         'sending',
    }
    get().appendMessage(conversationId, optimistic)

    try {
      const sent = await api.conversations.sendMessage(
        { id: conversationId },
        {
          content,
          escrow_id: context?.escrowId,
          ...(attachment !== undefined
            ? { attachment_url: attachment.url, attachment_type: attachment.type, attachment_size: attachment.size }
            : {}),
        },
      )
      set((s) => {
        const existing = s.messages[conversationId] ?? []
        // The WS echo of our own message may land before this response,
        // if the server id is already present, just drop the temp copy.
        const updated = existing.some((m) => m.id === sent.id)
          ? existing.filter((m) => m.id !== tempId)
          : existing.map((m) => (m.id === tempId ? { ...sent, _status: 'sent' as const } : m))
        return { messages: { ...s.messages, [conversationId]: updated } }
      })
    } catch {
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
            m.id === tempId ? { ...m, _status: 'failed' as const } : m,
          ),
        },
      }))
    }
  },

  retryMessage: (conversationId, message) => {
    // Remove the failed optimistic message then re-send its content (and
    // any already-uploaded attachment, the Cloudinary URL stays valid).
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).filter((m) => m.id !== message.id),
      },
    }))
    const attachment =
      message.attachment_url !== null && message.attachment_type !== null && message.attachment_size !== null
        ? { url: message.attachment_url, type: message.attachment_type, size: message.attachment_size }
        : undefined
    void get().sendMessage(
      conversationId,
      message.content,
      message.escrow_id !== null ? { escrowId: message.escrow_id, kind: message.escrow_kind } : undefined,
      attachment,
    )
  },

  closeConversation: async (conversationId) => {
    await api.conversations.close({ id: conversationId })
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== conversationId),
    }))
  },

  appendMessage: (conversationId, message) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: [...(s.messages[conversationId] ?? []), message],
      },
    }))
  },

  // WS delivery, dedupes by id (the broadcast echoes the sender's own
  // message back, and a reconnect-era fetchMessages may already have it).
  receiveMessage: (conversationId, message) => {
    set((s) => {
      const existing = s.messages[conversationId] ?? []
      if (existing.some((m) => m.id === message.id)) return s

      const isOwn = message.sender_id === useAuthStore.getState().user?.id
      const conversations = s.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              last_message:    message.content.length > 0 ? message.content : ATTACHMENT_PREVIEW,
              last_message_at: message.created_at,
            }
          : c,
      )
      return {
        messages: {
          ...s.messages,
          [conversationId]: [...existing, isOwn ? { ...message, _status: 'sent' as const } : message],
        },
        conversations,
      }
    })
  },
}))
