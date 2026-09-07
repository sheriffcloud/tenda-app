'use client'

/**
 * The ANONYMOUS feed's half of the live wiring — everything that is true of a
 * server-rendered page and of nothing else.
 *
 * The frame handling itself is `useGigFeedRealtime`, shared with the signed-in
 * open-gigs list. What is particular here:
 *   - this page is server-rendered, so "ask the server" means refreshing the
 *     RSC tree rather than refetching a list;
 *   - the refresh is DEBOUNCED, because a burst of frames would otherwise be a
 *     burst of full-tree refreshes;
 *   - it stores `GigCardModel`, not `GigSummary` — `toGigCardModel` keeps
 *     blockchain base units out of the HTML/RSC payload this page ships;
 *   - it owns the socket lifecycle, because a public page has no workspace
 *     layout to own it, and it loads the session first so a signed-in reader
 *     browsing the public feed gets frames instead of the polling fallback.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LIST_BURST_DEBOUNCE_MS, type GigListQuery } from '@tenda/shared'
import { toGigCardModel, type GigCardModel } from '@/components/gig/feed/gig-card-model'
import { useRealtimeConnection } from '@/hooks/connectivity/useRealtimeConnection'
import { useGigFeedRealtime } from '@/hooks/gig/useGigFeedRealtime'
import { useAuthStore } from '@/stores/auth.store'

export function usePublicGigFeedRealtime(args: {
  items: readonly GigCardModel[]
  query: GigListQuery
  applyItems: (items: GigCardModel[], membershipDelta: number) => void
}): void {
  const router = useRouter()
  const isLoading = useAuthStore((state) => state.isLoading)
  const loadSession = useAuthStore((state) => state.loadSession)
  const refreshTimer = useRef<number | null>(null)
  const argsRef = useRef(args)
  useEffect(() => { argsRef.current = args }, [args])

  useRealtimeConnection()
  useEffect(() => { if (isLoading) void loadSession() }, [isLoading, loadSession])

  const onReconcile = useCallback(() => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      router.refresh()
    }, LIST_BURST_DEBOUNCE_MS)
  }, [router])

  useEffect(() => () => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
  }, [])

  // The local apply patches the CLIENT's copy; the server-rendered tree behind
  // it is now stale, so an applied frame reconciles too. That is particular to
  // a server-rendered surface, which is why the shared hook leaves it here.
  const applyItems = useCallback(
    (items: GigCardModel[], membershipDelta: number) => {
      argsRef.current.applyItems(items, membershipDelta)
      onReconcile()
    },
    [onReconcile],
  )

  useGigFeedRealtime<GigCardModel>({
    items: args.items,
    query: args.query,
    project: toGigCardModel,
    applyItems,
    onReconcile,
  })
}
