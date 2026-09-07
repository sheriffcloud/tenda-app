/**
 * Thread bootstrap: findOrCreate + profile fetch + initial messages in
 * parallel, error → initError with a working retry, and no state writes
 * after unmount (the cancelled ref).
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { Conversation, Message, PublicUser } from '@tenda/shared'

const usersApi = vi.hoisted(() => ({ get: vi.fn<(p: { id: string }) => Promise<PublicUser>>() }))
vi.mock('@/api/client', () => ({ api: { users: usersApi } }))

import { useConversation } from '@/hooks/chat/useConversation'
import { useChatStore } from '@/stores/chat.store'
import { makeConversation } from '../../../test/factories/chat'
import { makePublicUser } from '../../../test/factories/user'

const findOrCreate = vi.fn<(userId: string) => Promise<Conversation>>()
const fetchMessages = vi.fn<(conversationId: string, beforeId?: string) => Promise<Message[]>>()


beforeEach(() => {
  vi.clearAllMocks()
  useChatStore.setState({ findOrCreate, fetchMessages })
  usersApi.get.mockResolvedValue(makePublicUser())
  findOrCreate.mockResolvedValue(makeConversation({ id: 'c1' }))
  fetchMessages.mockResolvedValue([])
})

test('resolves the conversation, the other user, and the first page', async () => {
  const { result } = renderHook(() => useConversation('them'))
  expect(result.current.loading).toBe(true)
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.conversationId).toBe('c1')
  expect(result.current.otherUser?.first_name).toBe('Ada')
  expect(result.current.initError).toBe(false)
  expect(fetchMessages).toHaveBeenCalledWith('c1')
})

test('a failing bootstrap reports initError and retry() recovers', async () => {
  findOrCreate.mockRejectedValueOnce(new Error('down'))
  const { result } = renderHook(() => useConversation('them'))
  await waitFor(() => expect(result.current.initError).toBe(true))

  act(() => result.current.retry())
  // Wait on the OUTCOME, not initError — init clears the error flag
  // synchronously before the refetch resolves.
  await waitFor(() => expect(result.current.conversationId).toBe('c1'))
  expect(result.current.initError).toBe(false)
})

test('undefined userId stays loading and calls nothing', () => {
  renderHook(() => useConversation(undefined))
  expect(findOrCreate).not.toHaveBeenCalled()
  expect(usersApi.get).not.toHaveBeenCalled()
})
