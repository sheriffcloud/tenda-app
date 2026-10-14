'use client'

/**
 * A one-line bar that appears when the connection drops while the app is open.
 *
 * The /offline ROUTE answers "you arrived with no connection"; this answers the
 * commoner case — a reader mid-flow whose requests have started failing and who
 * has no way to tell a dead network from a broken app. Saying which it is turns
 * "this is broken" into "this will work in a minute", and it is the only honest
 * thing the app can say about stale amounts.
 *
 * `role="status"` and not `alert`: it is a change in conditions, not a response
 * to something the reader just did, and an assertive interrupt on every subway
 * tunnel would be noise. It renders nothing while online, so it costs a
 * signed-in reader one boolean.
 *
 * The connection signal is the EXISTING `useOnlineStatus` — the transaction
 * monitor and the escrow live-refresh already read it, and its
 * `useSyncExternalStore` snapshot is the reason a server render says "online"
 * instead of hydrating into a mismatch.
 */
import Link from 'next/link'
import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/connectivity/useOnlineStatus'
import { OFFLINE_COPY } from './copy'

export function OfflineNotice() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-feedback-warning-border bg-feedback-warning-surface px-4 py-2 type-body-small font-semibold text-feedback-warning-text"
    >
      <WifiOff size={14} aria-hidden className="shrink-0" />
      <span>{OFFLINE_COPY.banner}</span>
      <Link href="/offline" className="shrink-0 underline underline-offset-2">
        {OFFLINE_COPY.availableTitle}
      </Link>
    </div>
  )
}
