import { test, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionUser, useSessionToken } from '@/lib/use-session'
import { setSession, clearSession, type AdminSessionUser } from '@/lib/auth'

const USER: AdminSessionUser = { id: 'u1', role: 'dispute_admin', first_name: 'Grace', last_name: 'Hopper' }

beforeEach(() => {
  localStorage.clear()
})

test('useSessionToken is null when logged out and updates after a storage event', () => {
  const { result } = renderHook(() => useSessionToken())
  expect(result.current).toBeNull()
  act(() => {
    setSession('jwt-1', USER)
    window.dispatchEvent(new StorageEvent('storage'))
  })
  expect(result.current).toBe('jwt-1')
})

test('useSessionUser surfaces the parsed user and clears on logout', () => {
  setSession('jwt-1', USER)
  const { result } = renderHook(() => useSessionUser())
  expect(result.current).toEqual(USER)
  act(() => {
    clearSession()
    window.dispatchEvent(new StorageEvent('storage'))
  })
  expect(result.current).toBeNull()
})

test('useSessionUser returns null for corrupt stored JSON', () => {
  localStorage.setItem('tenda_admin_user', '{{ broken')
  const { result } = renderHook(() => useSessionUser())
  expect(result.current).toBeNull()
})

test('useSessionUser returns a stable reference across re-renders for unchanged data', () => {
  setSession('jwt-1', USER)
  const { result, rerender } = renderHook(() => useSessionUser())
  const first = result.current
  rerender()
  // getSnapshot caches by raw JSON string, so the reference must not churn
  // (a fresh object every render would loop useSyncExternalStore).
  expect(result.current).toBe(first)
})
