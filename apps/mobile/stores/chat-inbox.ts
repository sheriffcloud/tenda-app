/**
 * The inbox half of the chat store: the conversation list, how it pages, and the
 * unread badge hung off it.
 *
 * A module of its own because the store grew past the house limit with paging,
 * and this is the natural seam: nothing here touches a thread's messages. The
 * store spreads `inboxActions` into its body, so `useChatStore` and everything
 * that imports it are unchanged.
 */
import type { StoreApi } from 'zustand'
import { api } from '@/api/client'
import {
  accountGeneration,
  INBOX_PAGE_SIZE,
  isSameAccount,
  mergeById,
  type Conversation,
} from '@tenda/shared'
import type { ChatState } from '@/stores/chat.store'

type InboxActions = Pick<
  ChatState,
  'fetchConversations' | 'loadMoreConversations' | 'findOrCreate' | 'closeConversation'
>

export const totalUnread = (list: readonly Conversation[]): number => list.reduce((sum, c) => sum + c.unread_count, 0)

/**
 * The list after a refresh of its newest page: the fresh page, then whatever the
 * client had scrolled to BEYOND it.
 *
 * Refreshes are frequent (focus, the poll, every realtime frame), so replacing
 * the list would throw away the older pages a user had just loaded and snap the
 * scroll back. The tail is found by the page's own last row: everything held
 * AFTER it is older than the page and still valid; everything before it is
 * covered by the page itself, so a row the page no longer lists (closed since)
 * is correctly gone. If that last row was never held, nothing can be said about
 * how the old list lines up with the new page, so it starts over from the page.
 */
function refreshFirstPage(held: readonly Conversation[], page: readonly Conversation[]): Conversation[] {
  // A short page IS the whole list: nothing older exists, so anything held
  // beyond it is a conversation that has since closed.
  if (page.length < INBOX_PAGE_SIZE) return [...page]
  const last = page[page.length - 1]
  const at = held.findIndex((c) => c.id === last?.id)
  if (at === -1) return [...page]
  const onPage = new Set(page.map((c) => c.id))
  return [...page, ...held.slice(at + 1).filter((c) => !onPage.has(c.id))]
}

export function inboxActions(
  set: StoreApi<ChatState>['setState'],
  get: StoreApi<ChatState>['getState'],
): InboxActions {
  return {
    fetchConversations: async () => {
      // Snapshot BEFORE the await. Emptying the store is a moment; this request
      // is already on its way and would otherwise write the previous account's
      // threads — and their unread badge — back in after the clear (#65).
      const gen = accountGeneration()
      const page = await api.conversations.list({ limit: INBOX_PAGE_SIZE })
      if (!isSameAccount(gen)) return
      set((s) => {
        const conversations = refreshFirstPage(s.conversations, page)
        // A kept tail means older pages are loaded, and whether MORE remain is
        // what the last load of the tail said — not something the newest page
        // can know. Only a list that is just this page decides for itself.
        const hasMore = conversations.length > page.length ? s.hasMoreConversations : page.length === INBOX_PAGE_SIZE
        return { conversations, unread: totalUnread(conversations), hasMoreConversations: hasMore }
      })
    },

    loadMoreConversations: async () => {
      const { conversations, hasMoreConversations, loadingMoreConversations } = get()
      const last = conversations[conversations.length - 1]
      if (!hasMoreConversations || loadingMoreConversations || last === undefined) return

      const gen = accountGeneration()
      set({ loadingMoreConversations: true })
      try {
        const page = await api.conversations.list({ before_id: last.id, limit: INBOX_PAGE_SIZE })
        if (!isSameAccount(gen)) return
        set((s) => {
          // The page continues from `last`. If the list moved under the request (a
          // refresh dropped the tail, a thread was closed) it no longer ends there,
          // and appending would leave a gap that no later page can ever fill.
          // Drop it; the next scroll asks again from wherever the list ends now.
          if (s.conversations[s.conversations.length - 1]?.id !== last.id) return { loadingMoreConversations: false }
          const merged = mergeById(s.conversations, page, (c) => c.id)
          return {
            conversations: merged,
            unread: totalUnread(merged),
            hasMoreConversations: page.length === INBOX_PAGE_SIZE,
            loadingMoreConversations: false,
          }
        })
      } catch {
        // A failed page leaves the list as it was and `hasMore` untouched, so the
        // next scroll to the end simply asks again — the notification feed's rule,
        // and the reason this never rejects into an `onEndReached` handler.
        if (isSameAccount(gen)) set({ loadingMoreConversations: false })
      }
    },

    findOrCreate: async (userId) => {
      const gen = accountGeneration()
      const conv = await api.conversations.findOrCreate({ user_id: userId })
      // The caller still gets its conversation — the screen that asked is gone
      // either way — but it must not be filed into the next account's inbox.
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

    // No generation guard, unlike every other async writer here: this one only
    // REMOVES a row by id, and a conversation uuid belonging to the previous
    // account cannot match anything in the next account's list. The write is a
    // no-op after a switch rather than a leak (#65).
    closeConversation: async (conversationId) => {
      await api.conversations.close({ id: conversationId })
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== conversationId),
      }))
    },
  }
}
