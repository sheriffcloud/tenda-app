'use client'

/**
 * "Ask the server again" while the socket is down, and once the moment it
 * comes back.
 *
 * Every live surface needs the same two guarantees and they are easy to get
 * subtly wrong apart: a list that went stale during a drop must catch up the
 * instant the socket returns, and a reader who never had a socket at all — an
 * anonymous visitor, or anyone the connection has given up on — must not be
 * left looking at a frozen page forever.
 *
 * What each caller does to resync differs and should: the anonymous feed is
 * server-rendered, so it refreshes the RSC tree; a client-fetched list refetches
 * itself. The POLICY is what is shared, and it lives here so the two cannot
 * drift into different intervals or different reconnect behaviour.
 *
 * Only while the tab is VISIBLE. A background tab that polls is spending the
 * reader's battery on a list nobody is looking at, and it will resync on
 * reconnect or on its next visible tick anyway.
 */
import { useEffect, useRef } from 'react'
import { LIST_OFFLINE_POLL_MS } from '@tenda/shared'
import { isDocumentVisible } from '@/hooks/connectivity/useDocumentVisibility'
import { useRealtimeStore } from '@/stores/realtime.store'

export function useResyncWhileDisconnected(onResync: () => void): void {
  const connected = useRealtimeStore((state) => state.connected)
  const wasConnected = useRef(connected)
  // The callback is read at fire time, so a caller need not memoise it to
  // avoid tearing the interval down on every render.
  const latest = useRef(onResync)
  useEffect(() => {
    latest.current = onResync
  }, [onResync])

  useEffect(() => {
    if (connected) {
      // Only on the EDGE. Re-running on every render while connected would
      // resync for no reason.
      if (!wasConnected.current) latest.current()
      wasConnected.current = true
      return
    }
    wasConnected.current = false
    const timer = window.setInterval(() => {
      // THE visibility shim's own point read — this folder's rule is one
      // implementation, not a copy per caller.
      if (isDocumentVisible()) latest.current()
    }, LIST_OFFLINE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [connected])
}
