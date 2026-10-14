/**
 * Session-tied socket lifecycle: connect while authenticated, tear down on
 * logout/unmount, and revive (idempotent connect) when the tab becomes
 * visible again — but never for a signed-out session, and using the auth
 * state at EVENT time rather than the render the listener was created in.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { useRealtimeConnection } from '@/hooks/connectivity/useRealtimeConnection'
import { useAuthStore } from '@/stores/auth.store'
import { ws } from '@/lib/ws'

vi.mock('@/lib/ws', () => ({
  ws: { connect: vi.fn(), disconnect: vi.fn() },
}))

let visibilityState: DocumentVisibilityState = 'visible'
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => visibilityState,
})

function setVisibility(next: DocumentVisibilityState) {
  visibilityState = next
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.clearAllMocks()
  visibilityState = 'visible'
  useAuthStore.setState({ isAuthenticated: false })
})

test('connects while authenticated and tears down on unmount', () => {
  useAuthStore.setState({ isAuthenticated: true })
  const { unmount } = renderHook(() => useRealtimeConnection())
  expect(ws.connect).toHaveBeenCalledTimes(1)
  unmount()
  expect(ws.disconnect).toHaveBeenCalledTimes(1)
})

test('a signed-out session disconnects instead of connecting', () => {
  renderHook(() => useRealtimeConnection())
  expect(ws.connect).not.toHaveBeenCalled()
  expect(ws.disconnect).toHaveBeenCalled()
})

test('logout mid-session tears the socket down', () => {
  useAuthStore.setState({ isAuthenticated: true })
  renderHook(() => useRealtimeConnection())
  expect(ws.connect).toHaveBeenCalledTimes(1)
  act(() => useAuthStore.setState({ isAuthenticated: false }))
  expect(ws.disconnect).toHaveBeenCalled()
})

test('returning to a visible tab revives the connection for an authed session', () => {
  useAuthStore.setState({ isAuthenticated: true })
  renderHook(() => useRealtimeConnection())
  act(() => setVisibility('hidden'))
  expect(ws.connect).toHaveBeenCalledTimes(1)
  act(() => setVisibility('visible'))
  expect(ws.connect).toHaveBeenCalledTimes(2)
})

test('a visible tab never reconnects a signed-out session, even after a stale render', () => {
  useAuthStore.setState({ isAuthenticated: true })
  renderHook(() => useRealtimeConnection())
  act(() => useAuthStore.setState({ isAuthenticated: false }))
  vi.mocked(ws.connect).mockClear()
  act(() => setVisibility('hidden'))
  act(() => setVisibility('visible'))
  expect(ws.connect).not.toHaveBeenCalled()
})
