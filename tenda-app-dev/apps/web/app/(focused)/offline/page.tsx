import type { Metadata } from 'next'
import { OfflinePanel } from '@/components/app/status/OfflinePanel'
import { OFFLINE_COPY } from '@/components/app/status/copy'

export const metadata: Metadata = {
  title: OFFLINE_COPY.title,
  robots: { index: false, follow: false },
}

/**
 * The offline screen (Auth comp, lines 657-676).
 *
 * A route rather than a state, for two reasons: it is where a service worker's
 * navigation fallback points (this app has none yet — a cached shell is its
 * own piece of work, and shipping a worker to serve one page would put a cache
 * layer in front of every route for it), and it is somewhere `OfflineNotice`
 * can send a reader whose connection dropped mid-flow.
 *
 * `follow: false` as well as `noindex`, unlike the rest of the focused group:
 * every link on this page is an action for a reader who is already here, not a
 * route worth discovering from it.
 */
export default function OfflinePage() {
  return <OfflinePanel />
}
