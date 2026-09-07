'use client'

/**
 * Poll a single number on an interval — a queue depth, a pending-report count,
 * anything a nav badge shows.
 *
 * Generic from the start rather than written for the dispute badge and copied
 * twice: the moderation and reports queues are the same shape, and the parts
 * that are easy to get wrong (the scheduling discipline, the hidden-tab pause,
 * the teardown) are exactly the parts a copy would carry a mutated version of.
 *
 * This app has no SWR or react-query — every read is plain `fetch` through
 * lib/api.ts, which owns the bearer token and the 401 redirect — so this is
 * hand-rolled. The caller supplies a `fetcher` that goes through that layer;
 * the hook only decides WHEN to call it.
 *
 * Three decisions worth stating, because each has a silent failure mode:
 *
 *  1. RECURSIVE setTimeout, never setInterval. The next request is scheduled
 *     after the previous one settles, so a response slower than the interval
 *     cannot stack requests — with setInterval a 40s response on a 30s poll
 *     opens a new request before the last closed, and the pile grows for as
 *     long as the API is slow, which is precisely when it must not. Same
 *     reasoning as the mobile poller.
 *
 *  2. A HIDDEN TAB COSTS NO REQUESTS. Precisely: the chain wakes at most ONCE
 *     after the tab goes away — the tick already scheduled fires, sees the tab
 *     is hidden and declines to reschedule — and then nothing until the tab
 *     comes back. Not "zero timers", which would need a second guard on the
 *     scheduling line to buy one avoided wake-up; zero network, which is the
 *     part that matters for a dashboard left open overnight.
 *
 *  3. The fetcher is read through a REF and is deliberately not a dependency.
 *     A caller MAY pass an inline arrow — a new identity on every render — and
 *     a `fetcher` dependency would then tear down and restart the loop each
 *     time, a request per render instead of per interval. The ref keeps the
 *     latest closure without letting its identity drive the schedule. (The
 *     dispute badge happens to pass a module-scope function and would not
 *     trigger it; the hook cannot assume every caller will.)
 */

import { useEffect, useRef, useState } from 'react'

export interface PolledCount {
  /** The most recent count. `null` until the first response arrives. */
  count: number | null
  /**
   * Whether the LAST attempt failed. `count` keeps its previous value: a
   * transient 500 should not blank a badge that was correct a moment ago, and
   * a 401 has already been handled by lib/api.ts (session cleared, redirected
   * to /login) before it reaches here.
   *
   * Exposed even though today's only consumer ignores it, which is a different
   * thing from speculative API: this is state the loop already computes, and
   * there is no other way for a caller to tell a fresh count from a stale one.
   * A `refresh()` would be the speculative addition — that is new machinery,
   * and no caller has needed it yet.
   */
  failed: boolean
}

const INITIAL: PolledCount = { count: null, failed: false }

/**
 * Keep the previous object when nothing actually changed.
 *
 * Returning `prev` from a setState updater makes React skip the re-render
 * entirely. Without this, a steady count still allocated a new object on every
 * tick, so every consumer re-rendered on every interval, forever, for no
 * change — cheap for one badge and not something to bake into a hook three
 * queues are meant to share.
 */
function nextState(prev: PolledCount, count: number | null, failed: boolean): PolledCount {
  if (prev.count === count && prev.failed === failed) return prev
  return { count, failed }
}

export function usePolledCount(fetcher: () => Promise<number>, intervalMs: number): PolledCount {
  const [state, setState] = useState<PolledCount>(INITIAL)

  // Updated in an effect rather than during render — writing a ref while
  // rendering is the thing StrictMode's double-invoke exists to surface.
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    // Everything the loop needs is a closure local, so the cleanup below
    // genuinely ends THIS run. Under StrictMode the effect is mounted, torn
    // down and mounted again; with these held in refs instead, the second
    // mount would adopt the first mount's pending timer and the poll would run
    // at twice its interval for the life of the page — in development only,
    // which is the worst place for it to hide. Next's App Router turns
    // StrictMode on by default, so that is the development configuration, not a
    // hypothetical. Pinned by 'StrictMode double-mount leaves ONE live chain',
    // which is the only test in the suite that fails if these become refs.
    //
    // `alive` is read in FIVE places and they are not equal. Classified once
    // here so nobody has to re-derive it, and because two of them read as
    // load-bearing and are not:
    //
    //   run() entry guard         — unreachable. After cleanup nothing can call
    //   visibility handler guard  — `run`: the timer is cleared and the
    //                                listener removed, and neither a queued
    //                                timer callback nor an in-progress dispatch
    //                                can interleave with cleanup on one thread.
    //                                Both survive deletion against all 16 tests
    //                                (measured). KEPT anyway — they are the
    //                                cheap half of a rule the cleanup depends
    //                                on, and the reasoning that makes them dead
    //                                is exactly the reasoning a future edit to
    //                                cleanup would invalidate.
    //   the two setState guards   — no-ops under React 19; noted at the call.
    //   the scheduling guard      — the load-bearing one; noted at the call.
    let alive = true
    let inFlight = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const isHidden = () => document.visibilityState === 'hidden'

    const run = async (): Promise<void> => {
      if (!alive || inFlight) return
      // Stop the chain outright — it is NOT rescheduled below. There is
      // deliberately no `paused` flag to consult: `onVisibilityChange` is the
      // only thing that restarts the loop, and it restarts unconditionally, so
      // a second copy of "are we stopped?" could only ever disagree with the
      // timer that is or isn't pending.
      if (isHidden()) return

      inFlight = true
      try {
        const count = await fetcherRef.current()
        // Belt-and-braces (see the classification above): React 18 removed the
        // update-on-unmounted warning and 19 treats the call as a no-op, so
        // deleting these two changes nothing observable — measured. Said
        // plainly so nobody writes a test claiming to prove a warning that no
        // longer exists; an earlier draft of this file did exactly that.
        if (alive) setState((prev) => nextState(prev, count, false))
      } catch {
        if (alive) setState((prev) => nextState(prev, prev.count, true))
      } finally {
        inFlight = false
      }

      // AFTER the response settles, not alongside it — see (1) above.
      //
      // The `alive` here is the load-bearing one of the five: drop it and a
      // response landing after unmount starts a fresh tick on a dead loop.
      // Pinned by 'a response landing after unmount is absorbed', whose timer
      // assertion has to sit before the clock moves to see it.
      if (alive) timer = setTimeout(() => void run(), intervalMs)
    }

    const onVisibilityChange = (): void => {
      if (!alive || isHidden()) return
      // Cancel the pending tick and go now, so coming back to the tab is
      // instant instead of up to `intervalMs` stale.
      //
      // Overlap is `run`'s problem, not this one: alt-tabbing during a slow
      // response finds `inFlight` already set and returns, leaving the open
      // request to reschedule when it lands. An `if (inFlight) return` here
      // would be dead code — while a request is in flight no timer is pending,
      // because the chain is only scheduled once a response settles.
      clearTimeout(timer)
      void run()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    void run()

    return () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [intervalMs])

  return state
}
