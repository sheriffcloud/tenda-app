'use client'

/**
 * Session state via useSyncExternalStore (#92) — the sanctioned way to
 * read localStorage from components: SSR snapshot is null, the client
 * snapshot re-renders after hydration (no mismatch), and the storage
 * subscription gives cross-tab logout for free.
 */

import { useSyncExternalStore } from 'react'
import { getToken, USER_KEY, type AdminSessionUser } from './auth'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

// getSnapshot must return a STABLE reference for unchanged data — cache
// the parsed user keyed by the raw JSON string.
let cachedRaw: string | null = null
let cachedUser: AdminSessionUser | null = null

function getUserSnapshot(): AdminSessionUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    if (raw === null) {
      cachedUser = null
    } else {
      try {
        cachedUser = JSON.parse(raw) as AdminSessionUser
      } catch {
        cachedUser = null
      }
    }
  }
  return cachedUser
}

export function useSessionUser(): AdminSessionUser | null {
  return useSyncExternalStore(subscribe, getUserSnapshot, () => null)
}

/** null while SSR/unauthenticated; the guard treats null as logged out. */
export function useSessionToken(): string | null {
  return useSyncExternalStore(subscribe, getToken, () => null)
}
