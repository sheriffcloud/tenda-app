/**
 * Web port of apps/mobile/hooks/useStanding.ts. Public standing for any
 * user (module-level TTL cache — PersonCards remount per page, one fetch
 * per user per 5-minute window is plenty) and the caller's own standing
 * with its active restriction. Mobile's focus refresh becomes mount (web
 * pages remount on navigation).
 */
import { useEffect, useState } from 'react'
import type { MyStandingResponse, UserStandingResponse } from '@tenda/shared'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'

const STANDING_TTL_MS = 5 * 60_000

interface CacheEntry {
  value: UserStandingResponse
  fetched_at: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<UserStandingResponse>>()

async function fetchStanding(userId: string): Promise<UserStandingResponse> {
  const hit = cache.get(userId)
  if (hit !== undefined && Date.now() - hit.fetched_at < STANDING_TTL_MS) return hit.value

  let pending = inflight.get(userId)
  if (pending === undefined) {
    pending = api.users
      .standing({ id: userId })
      .then((value) => {
        cache.set(userId, { value, fetched_at: Date.now() })
        return value
      })
      .finally(() => inflight.delete(userId))
    inflight.set(userId, pending)
  }
  return pending
}

/** Null while loading or on failure — the badge is decorative, never blocking. */
export function useUserStanding(userId: string | null): UserStandingResponse | null {
  const [standing, setStanding] = useState<UserStandingResponse | null>(null)

  useEffect(() => {
    if (userId === null) return
    let cancelled = false
    fetchStanding(userId)
      .then((value) => {
        if (!cancelled) setStanding(value)
      })
      .catch(() => {
        // Badge is decorative, a failed fetch just hides it.
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return standing
}

/**
 * The current user's own standing including the active restriction —
 * drives RestrictionBanner. Advisory only; the server guard stays
 * authoritative on every gated action.
 */
export function useMyStanding(): MyStandingResponse | null {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [standing, setStanding] = useState<MyStandingResponse | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    api.users
      .myStanding()
      .then(setStanding)
      .catch(() => {
        // Keep the last known value; the banner is advisory.
      })
  }, [isAuthenticated])

  return standing
}
