import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import type { GigSummary } from '@tenda/shared'
import { GIG_FEED_DEADLINE_RETRY_INTERVAL_MS } from './gig-feed.configuration'

const MAX_TIMER_DELAY_MS = 2_147_483_647

interface PendingDeadline {
  key: string
  deadlineMs: number
}

function deadlineKey(item: GigSummary): string | null {
  return item.accept_deadline === null ? null : `${item.escrow_id}:${item.accept_deadline}`
}

function nearestPendingDeadline(
  items: readonly GigSummary[],
  attempted: ReadonlySet<string>,
  nowMs: number,
): PendingDeadline | null {
  let nearest: PendingDeadline | null = null
  for (const item of items) {
    const deadlineValue = item.accept_deadline
    if (deadlineValue === null) continue
    const key = `${item.escrow_id}:${deadlineValue}`
    if (attempted.has(key)) continue
    const deadline = Date.parse(deadlineValue)
    if (!Number.isFinite(deadline)) continue
    const candidate = { key, deadlineMs: deadline }
    if (nearest === null || candidate.deadlineMs < nearest.deadlineMs) nearest = candidate
  }
  return nearest
}

/** Reconcile at the next deadline; the server, not the device clock, decides visibility. */
export function useGigDeadlineReconciliation(
  items: readonly GigSummary[],
  reconcile: () => Promise<boolean>,
): void {
  const reconcileRef = useRef(reconcile)
  const attemptedDeadlinesRef = useRef(new Set<string>())
  reconcileRef.current = reconcile
  useEffect(() => {
    const activeKeys = new Set(items.map(deadlineKey).filter((key): key is string => key !== null))
    for (const key of attemptedDeadlinesRef.current) {
      if (!activeKeys.has(key)) attemptedDeadlinesRef.current.delete(key)
    }
    const pending = nearestPendingDeadline(items, attemptedDeadlinesRef.current, Date.now())
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleDeadline = (retryDelayMs?: number): void => {
      if (pending === null) return
      const remainingMs = pending.deadlineMs - Date.now()
      const delayMs = retryDelayMs ?? Math.max(0, Math.min(remainingMs, MAX_TIMER_DELAY_MS))
      timer = setTimeout(async () => {
        if (cancelled) return
        if (remainingMs > MAX_TIMER_DELAY_MS) {
          scheduleDeadline()
          return
        }
        try {
          const succeeded = await reconcileRef.current()
          if (!cancelled && succeeded) attemptedDeadlinesRef.current.add(pending.key)
          if (!cancelled && !succeeded) scheduleDeadline(GIG_FEED_DEADLINE_RETRY_INTERVAL_MS)
        } catch {
          if (!cancelled) scheduleDeadline(GIG_FEED_DEADLINE_RETRY_INTERVAL_MS)
        }
      }, delayMs)
    }
    scheduleDeadline()
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcileRef.current().catch(() => undefined)
    })
    return () => {
      cancelled = true
      if (timer !== null) clearTimeout(timer)
      appState.remove()
    }
  }, [items])
}
