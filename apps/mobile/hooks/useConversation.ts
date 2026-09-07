import { useCallback, useEffect, useState } from 'react'
import { useChatStore } from '@/stores/chat.store'
import { api } from '@/api/client'
import type { PublicUser } from '@tenda/shared'

interface UseConversationResult {
  conversationId: string | null
  otherUser: PublicUser | null
  loading: boolean
  initError: boolean
  retry: () => void
}

/**
 * Finds or creates a conversation with the given user,
 * fetches their profile, and loads the initial messages.
 */
export function useConversation(userId: string | undefined): UseConversationResult {
  const { findOrCreate, fetchMessages } = useChatStore()

  const [conversationId, setConversationId] = useState<string | null>(null)
  const [otherUser,      setOtherUser]      = useState<PublicUser | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [initError,      setInitError]      = useState(false)

  const init = useCallback(async (cancelled: { current: boolean }) => {
    if (!userId) return
    setLoading(true)
    setInitError(false)
    try {
      const [conv, user] = await Promise.all([
        findOrCreate(userId),
        api.users.get({ id: userId }),
      ])
      if (cancelled.current) return
      setConversationId(conv.id)
      setOtherUser(user)
      await fetchMessages(conv.id)
    } catch {
      if (!cancelled.current) setInitError(true)
    } finally {
      if (!cancelled.current) setLoading(false)
    }
  }, [userId, findOrCreate, fetchMessages])

  useEffect(() => {
    const cancelled = { current: false }
    init(cancelled)
    return () => { cancelled.current = true }
  }, [init])

  const retry = useCallback(() => {
    const cancelled = { current: false }
    void init(cancelled)
  }, [init])

  return { conversationId, otherUser, loading, initError, retry }
}
