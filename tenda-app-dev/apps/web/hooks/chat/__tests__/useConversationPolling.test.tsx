/**
 * The inbox fallback poll: immediate run + 15s recursive cadence, paused
 * while the tab is hidden and resumed (with an immediate run) on return,
 * fully inert when disabled.
 */
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useConversationPolling } from '@/hooks/chat/useConversationPolling'
import { useChatStore } from '@/stores/chat.store'

let visibilityState: DocumentVisibilityState = 'visible'
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => visibilityState,
})

function setVisibility(next: DocumentVisibilityState) {
  visibilityState = next
  document.dispatchEvent(new Event('visibilitychange'))
}

const fetchConversations = vi.fn<() => Promise<void>>()

beforeEach(() => {
  vi.useFakeTimers()
  visibilityState = 'visible'
  fetchConversations.mockReset().mockResolvedValue()
  useChatStore.setState({ fetchConversations })
})

afterEach(() => {
  vi.useRealTimers()
})

test('runs immediately, then on the 15s recursive cadence; unmount stops it', async () => {
  const { unmount } = renderHook(() => useConversationPolling(true))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(fetchConversations).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(15_000))
  expect(fetchConversations).toHaveBeenCalledTimes(2)
  unmount()
  await act(() => vi.advanceTimersByTimeAsync(60_000))
  expect(fetchConversations).toHaveBeenCalledTimes(2)
})

test('disabled → completely inert', async () => {
  renderHook(() => useConversationPolling(false))
  await act(() => vi.advanceTimersByTimeAsync(60_000))
  expect(fetchConversations).not.toHaveBeenCalled()
})

test('hiding the tab pauses the loop; returning resumes with an immediate run', async () => {
  renderHook(() => useConversationPolling(true))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(fetchConversations).toHaveBeenCalledTimes(1)

  act(() => setVisibility('hidden'))
  await act(() => vi.advanceTimersByTimeAsync(60_000))
  expect(fetchConversations).toHaveBeenCalledTimes(1) // paused

  act(() => setVisibility('visible'))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(fetchConversations).toHaveBeenCalledTimes(2) // immediate catch-up

  await act(() => vi.advanceTimersByTimeAsync(15_000))
  expect(fetchConversations).toHaveBeenCalledTimes(3) // cadence continues
})

test('a fetch in flight when the tab hides must NOT re-arm the loop', async () => {
  let resolveFetch: (() => void) | undefined
  fetchConversations.mockReturnValueOnce(new Promise((r) => { resolveFetch = r }))
  renderHook(() => useConversationPolling(true))
  await act(() => vi.advanceTimersByTimeAsync(0)) // immediate run now pending

  act(() => setVisibility('hidden'))
  await act(async () => {
    resolveFetch?.()
  })
  await act(() => vi.advanceTimersByTimeAsync(60_000))
  expect(fetchConversations).toHaveBeenCalledTimes(1) // completion did not reschedule

  act(() => setVisibility('visible'))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(fetchConversations).toHaveBeenCalledTimes(2) // resume restarts the loop
})

test('a fetch resolving after a hide/show resume never doubles the cadence', async () => {
  let resolveOld: (() => void) | undefined
  fetchConversations.mockReturnValueOnce(new Promise((r) => { resolveOld = r }))
  renderHook(() => useConversationPolling(true))
  await act(() => vi.advanceTimersByTimeAsync(0)) // old fetch pending

  act(() => setVisibility('hidden'))
  act(() => setVisibility('visible')) // resume runs a SECOND fetch
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(fetchConversations).toHaveBeenCalledTimes(2)

  await act(async () => {
    resolveOld?.() // old fetch completes AFTER the resume chain scheduled
  })
  // One interval → exactly one poll; a doubled chain would fire two.
  await act(() => vi.advanceTimersByTimeAsync(15_000))
  expect(fetchConversations).toHaveBeenCalledTimes(3)
  await act(() => vi.advanceTimersByTimeAsync(15_000))
  expect(fetchConversations).toHaveBeenCalledTimes(4)
})

test('a failing fetch keeps the loop alive', async () => {
  fetchConversations.mockRejectedValue(new Error('down'))
  renderHook(() => useConversationPolling(true))
  await act(() => vi.advanceTimersByTimeAsync(0))
  await act(() => vi.advanceTimersByTimeAsync(15_000))
  expect(fetchConversations).toHaveBeenCalledTimes(2)
})
