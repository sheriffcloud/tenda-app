/**
 * Web port of apps/mobile/stores/chat.store.ts — verbatim state machine:
 * optimistic send with temp ids, WS-echo dedupe (the broadcast echoes the
 * sender's own message and may beat the POST response), retry re-sends the
 * already-uploaded attachment, and fetchMessages merges server truth with
 * still-pending optimistic copies.
 *
 * Nothing about the state machine is web's any more: `UploadedAttachment` used
 * to be the one import that differed, and since #43 it comes from @tenda/shared
 * on both clients. What is still web's is the transport under `api` and the
 * account-reset wiring above.
 */
import { create } from 'zustand'
import { accountGeneration, isSameAccount, registerAccountReset } from '@/lib/account-state'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'
import {
  ATTACHMENT_PREVIEW,
  type Conversation,
  type Message,
  type UploadedAttachment,
} from '@tenda/shared'

// A message optimistically added before server confirmation
export type LocalMessage = Message & {
  _status?: 'sending' | 'sent' | 'failed'
}

/** The escrow (gig/exchange) a message is contextually attached to. */
export interface EscrowContext {
  escrowId: string
  kind: 'gig' | 'exchange' | null
}

/**
 * Whether the inbox has ever been read from the server.
 *
 * In the STORE rather than in whatever renders the list, because the workspace
 * mounts the list column from two different route slots (@list/messages and
 * @list/chat) and Next remounts the component when the route moves between
 * them. Component-local `loading` state therefore starts true again on every
 * thread open, and the column blinked to a skeleton each time — measured:
 * `["rows:1", "SKELETON", "rows:1"]` — which is exactly the "the list never
 * leaves" promise the column exists to keep.
 */
export type InboxStatus = 'idle' | 'loading' | 'ready' | 'error'

interface ChatState {
  conversations: Conversation[]
  conversationsStatus: InboxStatus
  messages: Record<string, LocalMessage[]> // conversationId → messages (oldest first)
  unread: number // total unread across all conversations

  fetchConversations: () => Promise<void>
  findOrCreate: (userId: string) => Promise<Conversation>
  fetchMessages: (conversationId: string, beforeId?: string) => Promise<Message[]>
  sendMessage: (conversationId: string, content: string, context?: EscrowContext, attachment?: UploadedAttachment) => Promise<void>
  retryMessage: (conversationId: string, message: LocalMessage) => void
  closeConversation: (conversationId: string) => Promise<void>
  appendMessage: (conversationId: string, message: LocalMessage) => void
  receiveMessage: (conversationId: string, message: Message) => void
  /** Drop everything this account read. Called from `logout`. */
  reset: () => void
}

/**
 * Everything here belongs to ONE account.
 *
 * Sign-out is a soft navigation (`router.replace('/gigs')`), so the JS context
 * — and every store in it — survives an account switch made in the same tab.
 * Measured before this existed: signing in as someone else showed the previous
 * account's threads in the inbox column. Same doctrine as the notifications
 * store, which `logout` has always reset for exactly this reason.
 */
const INITIAL = {
  conversations: [] as Conversation[],
  conversationsStatus: 'idle' as InboxStatus,
  messages: {} as Record<string, LocalMessage[]>,
  unread: 0,
}

export const useChatStore = create<ChatState>((set, get) => ({
  ...INITIAL,

  fetchConversations: async () => {
    // #45: these rows belong to whoever is signed in NOW. See lib/account-state.
    const gen = accountGeneration()
    // Never flash a skeleton over an inbox that has already settled. The
    // column raises one whenever the status is 'loading' AND it holds no rows
    // — a guard that protects a populated list and fails an EMPTY one, which
    // is the commonest new account. With the socket down the fallback poll
    // runs every 15s, so "No messages yet" flickered to a skeleton and back,
    // indefinitely (#26). Same rule, same shape as chain-registry.store.
    set((s) => (s.conversationsStatus === 'ready' ? {} : { conversationsStatus: 'loading' }))
    try {
      const convs = await api.conversations.list()
      if (!isSameAccount(gen)) return
      const unread = convs.reduce((sum, c) => sum + c.unread_count, 0)
      set({ conversations: convs, unread, conversationsStatus: 'ready' })
    } catch (e) {
      // Still rethrown for the caller that awaits it, but a dead session's
      // failure must not put an error on the next account's inbox.
      if (!isSameAccount(gen)) throw e
      // Only when nothing has settled yet. The column shows its error state
      // whenever the status is 'error' and it holds no rows — which a
      // genuinely EMPTY inbox always does — so without this a single failed
      // poll replaced a true "No conversations yet" with "Could not load your
      // messages". The same rule the column states for a populated list, and
      // the same shape chain-registry.store uses: keep the last good answer,
      // report an error only when there is none (#26).
      set((s) => (s.conversationsStatus === 'ready' ? {} : { conversationsStatus: 'error' }))
      // Still thrown: the badge's own callers swallow it, and the list column
      // reads the status — but a caller that awaits this must still be able to
      // tell that it failed.
      throw e
    }
  },

  findOrCreate: async (userId) => {
    const gen = accountGeneration()
    const conv = await api.conversations.findOrCreate({ user_id: userId })
    // Adds a row when it is not already held, so an emptied store gains one.
    if (!isSameAccount(gen)) return conv
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
    const gen = accountGeneration()
    const fetched = await api.conversations.messages({ id: conversationId }, beforeId ? { before_id: beforeId } : undefined)
    if (!isSameAccount(gen)) return fetched
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
        messages: { ...s.messages, [conversationId]: [...ordered, ...optimistic] },
        conversations,
        unread,
      }
    })

    return fetched
  },

  sendMessage: async (conversationId, content, context, attachment) => {
    const tempId = `temp_${Date.now()}`
    const optimistic: LocalMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: useAuthStore.getState().user?.id ?? '',
      escrow_id: context?.escrowId ?? null,
      escrow_title: null,
      escrow_kind: context?.kind ?? null,
      content,
      attachment_url: attachment?.url ?? null,
      attachment_type: attachment?.type ?? null,
      attachment_size: attachment?.size ?? null,
      read_at: null,
      created_at: new Date().toISOString(),
      _status: 'sending',
    }
    get().appendMessage(conversationId, optimistic)

    // #45, and the last of this store's four writers to take one (#93). Not a
    // leak it closes: after a logout the thread is already reset, nothing
    // matches the temp id, and both writes below put an empty array back — #73
    // pins that from the other side. It is uniformity, and one less thing to
    // reason about the next time this file changes.
    const gen = accountGeneration()
    // The try wraps the REQUEST only (#72): wrapping the swap too sent a throw
    // there to the failure handler, so Retry duplicated a stored message.
    let sent: Message
    try {
      sent = await api.conversations.sendMessage(
        { id: conversationId },
        {
          content,
          escrow_id: context?.escrowId,
          ...(attachment !== undefined
            ? { attachment_url: attachment.url, attachment_type: attachment.type, attachment_size: attachment.size }
            : {}),
        },
      )
    } catch {
      // The send did not reach the server: mark it failed and offer Retry.
      // Still a write into the thread list, so it is guarded like the rest.
      if (isSameAccount(gen)) {
        set((s) => ({
          messages: {
            ...s.messages,
            [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
              m.id === tempId ? { ...m, _status: 'failed' as const } : m,
            ),
          },
        }))
      }
      return
    }

    if (!isSameAccount(gen)) return
    try {
      set((s) => {
        const existing = s.messages[conversationId] ?? []
        // The WS echo of our own message may land before this response,
        // if the server id is already present, just drop the temp copy.
        const updated = existing.some((m) => m.id === sent.id)
          ? existing.filter((m) => m.id !== tempId)
          : existing.map((m) => (m.id === tempId ? { ...sent, _status: 'sent' as const } : m))
        return { messages: { ...s.messages, [conversationId]: updated } }
      })
    } catch (e) {
      // Contained but NOT as a failed send: the server has it, so this must
      // never offer a duplicating Retry; the copy stays 'sending'.
      console.warn('[chat] send succeeded but the store update failed:', e)
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

  reset: () => set({ ...INITIAL }),

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
              last_message: message.content.length > 0 ? message.content : ATTACHMENT_PREVIEW,
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

/**
 * ACCOUNT-SCOPED: conversations and their messages. Registered here rather
 * than called from `logout` so the declaration sits beside the state it
 * protects — see lib/account-state.ts.
 */
registerAccountReset(() => useChatStore.getState().reset())
