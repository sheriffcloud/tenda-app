'use client'

/**
 * The unclaimed-dispute count, on the Disputes nav item.
 *
 * A dispute that nobody has claimed is the one piece of admin state where the
 * cost of not noticing falls on a user rather than on us — their money is held
 * while it sits there. The Slack alert covers the moment it is raised; this
 * covers the hours afterwards, when the alert has scrolled away and the only
 * question is whether anything is still waiting.
 *
 * NO new server surface: `GET /v1/admin/disputes?status=open&assigned=none`
 * already exists and already returns `total`. `limit: 1` because the badge
 * wants the count, not the rows — the route computes `total` with its own
 * `count(*)` independent of the page, so one row is the cheapest honest way to
 * ask for it. (`clampLimit` accepts 1, so this is not silently widened.)
 *
 * The polling discipline — recursive scheduling, no requests while the tab is
 * hidden, an instant refetch on return — belongs to `usePolledCount` and is
 * tested there.
 *
 * WHEN IT POLLS AT ALL is decided by the sidebar, not here: this renders only
 * inside the Disputes nav item, which `visibleNav` only emits for a role with
 * `disputes.read`. So an admin without that permission never mounts this
 * component and never sends a request the API would 403 — the gate is
 * structural rather than a second permission check that could drift from the
 * first.
 */

import { SidebarMenuBadge } from '@/components/ui/sidebar'
import { adminApi } from '@/api/client'
import { usePolledCount } from '@/hooks/use-polled-count'

/**
 * Slow enough that an idle dashboard is not a load source, fast enough that
 * "is anything waiting?" is answered before an admin would think to refresh.
 * A backgrounded tab sends no requests at any interval — see `usePolledCount`,
 * which is precise about the one timer it does still wake.
 */
export const DISPUTE_QUEUE_POLL_MS = 30_000

/**
 * Module scope, so the fetcher has ONE identity for the life of the page.
 * `usePolledCount` tolerates a fresh closure per render, but there is no
 * reason to hand it one when the query never varies.
 */
async function unclaimedDisputeCount(): Promise<number> {
  const page = await adminApi.disputes.list({ status: 'open', assigned: 'none', limit: 1 })
  return page.total
}

export function DisputeQueueBadge() {
  const { count } = usePolledCount(unclaimedDisputeCount, DISPUTE_QUEUE_POLL_MS)

  // Two different absences, deliberately rendered the same way.
  //
  // `0` — nothing is waiting. A literal "0" would be a permanent decoration on
  // a nav item that is fine, and the point of a badge is that its presence
  // means something.
  //
  // `null` — nothing is KNOWN yet: the first poll has not landed, or it landed
  // as a failure. Showing nothing is the only honest render for that, and it is
  // as far as the honesty goes on a cold start. Once a count HAS arrived,
  // `usePolledCount` keeps it through later failures, so an outage leaves the
  // last known number on screen rather than silently redrawing a queue of five
  // as empty — the two cases are split across two tests for that reason.
  if (count === null || count === 0) return null

  return (
    <SidebarMenuBadge
      // `role="status"` is load-bearing, not decoration. `SidebarMenuBadge`
      // renders a bare <div>, which maps to the ARIA `generic` role — and
      // `generic` PROHIBITS naming from the author, so `aria-label` on it is
      // ignored by real screen readers. `status` is a role that supports a
      // name, and is the honest description of a live count besides.
      //
      // Worth knowing before trusting a test here: jsdom's accessible-name
      // implementation does not model the prohibition, so a `getByLabelText`
      // query passes with or without this attribute — the label query cannot
      // see the difference the spec cares about. The tests therefore query BY
      // ROLE, which does fail when this line is removed.
      role="status"
      // The number alone is meaningless read aloud, and the element is
      // pointer-events-none so there is no tooltip to fall back on.
      aria-label={`${count} unclaimed ${count === 1 ? 'dispute' : 'disputes'}`}
    >
      {count}
    </SidebarMenuBadge>
  )
}
