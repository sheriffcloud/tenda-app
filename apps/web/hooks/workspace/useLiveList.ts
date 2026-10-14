'use client'

/**
 * Keeps a PERSONAL list current — My Gigs, My Disputes, and anything else whose
 * rows are the reader's own.
 *
 * These lists cannot be patched from a frame the way the gig feed can: nothing
 * on the wire carries "your gig gained an applicant" as data. What they get is
 * a signal — a notification on `user:<id>` means something happened to this
 * reader — and the honest response to a signal without data is to ask the
 * server again. Same trade `useEscrowLiveRefresh` already makes.
 *
 * Both triggers are shared rather than reinvented per list: `onPersonalEvent`
 * for the signal, `useResyncWhileDisconnected` for the reconnect edge and the
 * fallback while the socket is down.
 *
 * The revalidation is expected to be SILENT — `usePaginatedList`'s 'reload'
 * mode raises no spinner and keeps later pages — so a reader watching the list
 * sees rows change, never a skeleton.
 */
import { useCallback, useEffect, useRef } from 'react'
import { LIST_BURST_DEBOUNCE_MS } from '@tenda/shared'
import { useResyncWhileDisconnected } from '@/hooks/connectivity/useResyncWhileDisconnected'
import { onPersonalEvent } from '@/stores/realtime.store'

export function useLiveList(revalidate: () => void): void {
  const latest = useRef(revalidate)
  useEffect(() => {
    latest.current = revalidate
  }, [revalidate])

  const timer = useRef<number | null>(null)
  const schedule = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      latest.current()
    }, LIST_BURST_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    const unsubscribe = onPersonalEvent(schedule)
    return () => {
      unsubscribe()
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [schedule])

  // A reconnect is a catch-up, not a burst: go straight to the server rather
  // than waiting out a debounce the reader would feel.
  useResyncWhileDisconnected(() => latest.current())
}
