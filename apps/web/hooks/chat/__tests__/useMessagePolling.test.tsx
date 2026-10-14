/**
 * The thread fallback poll: recursive setTimeout at 4s, backing off to 10s
 * after 3 consecutive empty polls, resetting on new rows, stopping when the
 * id is null or on unmount.
 */
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useMessagePolling } from '@/hooks/chat/useMessagePolling'
import { useChatStore } from '@/stores/chat.store'
import type { LocalMessage } from '@/stores/chat.store'
import type { Message } from '@tenda/shared'

const fetchMessages = vi.fn<(conversationId: string, beforeId?: string) => Promise<Message[]>>()

let visibilityState: DocumentVisibilityState = 'visible'
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => visibilityState,
})

beforeEach(() => {
  vi.useFakeTimers()
  visibilityState = 'visible'
  fetchMessages.mockReset().mockResolvedValue([])
  useChatStore.setState({ messages: {}, fetchMessages })
})

afterEach(() => {
  vi.useRealTimers()
})

test('null conversation id never polls', async () => {
  renderHook(() => useMessagePolling(null))
  await act(() => vi.advanceTimersByTimeAsync(60_000))
  expect(fetchMessages).not.toHaveBeenCalled()
})

test('polls at the fast cadence, then parks on the idle cadence after 3 empty polls', async () => {
  renderHook(() => useMessagePolling('c1'))

  await act(() => vi.advanceTimersByTimeAsync(4_000))
  expect(fetchMessages).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(4_000))
  await act(() => vi.advanceTimersByTimeAsync(4_000))
  expect(fetchMessages).toHaveBeenCalledTimes(3)

  // Empty-poll limit reached: the next tick is 10s away, not 4s.
  await act(() => vi.advanceTimersByTimeAsync(4_000))
  expect(fetchMessages).toHaveBeenCalledTimes(3)
  await act(() => vi.advanceTimersByTimeAsync(6_000))
  expect(fetchMessages).toHaveBeenCalledTimes(4)
})

test('a poll that lands new rows resets the back-off to the fast cadence', async () => {
  renderHook(() => useMessagePolling('c1'))
  // Three empty polls park it on idle:
  await act(() => vi.advanceTimersByTimeAsync(12_000))
  expect(fetchMessages).toHaveBeenCalledTimes(3)

  // The 4th poll (10s later) grows the store — cadence resets to 4s.
  fetchMessages.mockImplementationOnce(async () => {
    const grown = [{ id: 'm1' } as LocalMessage]
    useChatStore.setState((s) => ({ messages: { ...s.messages, c1: grown } }))
    return []
  })
  await act(() => vi.advanceTimersByTimeAsync(10_000))
  expect(fetchMessages).toHaveBeenCalledTimes(4)
  await act(() => vi.advanceTimersByTimeAsync(4_000))
  expect(fetchMessages).toHaveBeenCalledTimes(5)
})

test('a hidden tab skips fetches but keeps the loop armed for the return', async () => {
  visibilityState = 'hidden'
  renderHook(() => useMessagePolling('c1'))
  await act(() => vi.advanceTimersByTimeAsync(12_000))
  expect(fetchMessages).not.toHaveBeenCalled() // three ticks, all skipped

  visibilityState = 'visible'
  await act(() => vi.advanceTimersByTimeAsync(4_000))
  expect(fetchMessages).toHaveBeenCalledTimes(1)
})

test('poll errors are silent and the loop keeps going', async () => {
  fetchMessages.mockRejectedValue(new Error('down'))
  renderHook(() => useMessagePolling('c1'))
  await act(() => vi.advanceTimersByTimeAsync(4_000))
  expect(fetchMessages).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(4_000))
  expect(fetchMessages).toHaveBeenCalledTimes(2)
})

test('unmount stops the loop', async () => {
  const { unmount } = renderHook(() => useMessagePolling('c1'))
  await act(() => vi.advanceTimersByTimeAsync(4_000))
  expect(fetchMessages).toHaveBeenCalledTimes(1)
  unmount()
  await act(() => vi.advanceTimersByTimeAsync(60_000))
  expect(fetchMessages).toHaveBeenCalledTimes(1)
})
