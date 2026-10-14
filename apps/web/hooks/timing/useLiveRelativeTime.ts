'use client'

/**
 * A relative-time label that stays true while the page sits open.
 *
 * The bug this exists for: `formatRelativeShort` is a pure function of the
 * clock, and every caller sampled that clock ONCE — at render. A feed card
 * only re-renders when a realtime update lands, and the gig detail's header
 * and terms are server-rendered strings frozen in the HTML. So a gig posted
 * while the reader watched said "Posted now" for as long as they stayed,
 * which is a claim about the present tense that stops being true after a
 * minute. `useNow` already documented this as deferred ("live ticking arrives
 * with the S5.4 live-refresh work"); this is that work.
 *
 * ONE ticker for the whole page, not one per timestamp. A feed is twenty
 * cards, and twenty timers waking independently is twenty times the work for
 * the same second.
 *
 * `useSyncExternalStore` rather than `useState` + an effect, for two
 * properties that are hard to get any other way:
 *
 *  - `getServerSnapshot` puts a real label in the SSR HTML, so the public page
 *    — which must render without the bundle — is not blank where its
 *    timestamps go. It is the SAME live function as `getSnapshot`, so the
 *    hydration pass reads the clock again: if the label moved in between,
 *    React patches the text rather than leaving the server's. See
 *    `RelativeTime` for why that (and its one dev warning) is the choice.
 *  - the snapshot is the formatted STRING, so React's `Object.is` bail-out
 *    does the filtering: a tick that does not change what a card says does not
 *    re-render that card. Most ticks change nothing for most timestamps.
 *
 * Recursive `setTimeout`, never `setInterval` (project rule — the delay is an
 * idle gap), and the timer only exists while something is subscribed.
 */
import { useCallback, useSyncExternalStore } from 'react'
import { formatRelativeShort } from '@tenda/shared'

/**
 * How stale a label may be. The labels change on the minute at the finest
 * (`formatRelativeShort`: now → 1m → … → 1h → … → 1d), so this is an upper
 * bound on lag rather than a render cadence — the bail-out above means a tick
 * that changes nothing costs a string compare per mounted timestamp.
 *
 * Background tabs are the browser's problem, not ours: timers are throttled
 * to about once a minute when a tab is hidden, which is exactly the behaviour
 * we would have written by hand.
 */
const TICK_MS = 10_000

const subscribers = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

/**
 * The invariant, enforced entirely by `subscribe` below: a timer exists
 * exactly while `subscribers` is non-empty — started on the first subscriber,
 * cleared on the last. So this deliberately does NOT re-check the set before
 * rescheduling. React commits its unmounts after the notify loop returns, not
 * inside it, so the re-schedule cannot run against an emptied set; a guard
 * here would be a branch no test could reach, which is worse than none.
 */
function schedule(): void {
  timer = setTimeout(() => {
    // Copied before iterating: a notified component may unmount and
    // unsubscribe during the loop, and mutating a Set mid-iteration is how a
    // subscriber gets silently skipped.
    for (const notify of [...subscribers]) notify()
    schedule()
  }, TICK_MS)
}

function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange)
  if (timer === null) schedule()
  return () => {
    subscribers.delete(onStoreChange)
    if (subscribers.size === 0 && timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
}

/** The compact "now · 12m · 5h · 3d" label for an instant, kept current. */
export function useLiveRelativeTime(iso: string): string {
  const snapshot = useCallback(() => formatRelativeShort(iso), [iso])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
