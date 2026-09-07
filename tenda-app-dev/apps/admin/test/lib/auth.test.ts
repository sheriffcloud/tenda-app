import { test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getToken,
  getSessionUser,
  setSession,
  clearSession,
  USER_KEY,
  type AdminSessionUser,
} from '@/lib/auth'

const USER: AdminSessionUser = { id: 'u1', role: 'super_admin', first_name: 'Ada', last_name: 'Lovelace' }

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('setSession then getToken/getSessionUser round-trips the stored session', () => {
  setSession('jwt-123', USER)
  expect(getToken()).toBe('jwt-123')
  expect(getSessionUser()).toEqual(USER)
})

test('getToken/getSessionUser return null when nothing is stored', () => {
  expect(getToken()).toBeNull()
  expect(getSessionUser()).toBeNull()
})

test('clearSession removes both token and user', () => {
  setSession('jwt-123', USER)
  clearSession()
  expect(getToken()).toBeNull()
  expect(getSessionUser()).toBeNull()
})

test('getSessionUser returns null on corrupt JSON (parse throws → caught)', () => {
  localStorage.setItem(USER_KEY, '{ not valid json')
  expect(getSessionUser()).toBeNull()
})

test('getToken/getSessionUser return null during SSR (no window)', () => {
  // The server render has no window; both guards must short-circuit to null.
  vi.stubGlobal('window', undefined)
  expect(getToken()).toBeNull()
  expect(getSessionUser()).toBeNull()
})
