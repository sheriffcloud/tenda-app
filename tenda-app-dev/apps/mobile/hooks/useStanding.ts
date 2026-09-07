import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import type { MyStandingResponse, UserStandingResponse } from '@tenda/shared'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'

const STANDING_TTL_MS = 5 * 60_000

interface CacheEntry {
  value: UserStandingResponse
  fetched_at: number
}

// Module-level cache, PersonCards re-mount per screen; one fetch per user
// per TTL window is plenty (standing moves on escrow events, not seconds).
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

/**
 * Public standing for any user (stage-7 § mobile), drives StandingBadge
 * and the detail sheet. Null while loading or on fetch failure (the badge
 * simply doesn't render).
 */
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
 * The current user's own standing including the active restriction,
 * drives RestrictionBanner. Refreshes on screen focus; WS live updates
 * slot in once the worker republish lands (#33).
 */
export function useMyStanding(): MyStandingResponse | null {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [standing, setStanding] = useState<MyStandingResponse | null>(null)

  const refresh = useCallback(() => {
    if (!isAuthenticated) return
    api.users
      .myStanding()
      .then(setStanding)
      .catch(() => {
        // Keep the last known value, the banner is advisory; the server
        // guard is authoritative on every gated action.
      })
  }, [isAuthenticated])

  useFocusEffect(
    useCallback(() => {
      refresh()
    }, [refresh]),
  )

  return standing
}
