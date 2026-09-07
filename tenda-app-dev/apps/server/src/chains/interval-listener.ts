/**
 * Shared timer skeleton behind every polling `ChainListener`: run the
 * chain-specific tick on a cadence, never overlap ticks (a slow RPC round-trip
 * must not stack), log-and-continue on tick failure, and unref the timer so a
 * draining process isn't held open. The tick owns all chain logic; this owns
 * only the clock.
 *
 * RECURSIVE `setTimeout`, not `setInterval` — the same choice the mobile poller
 * makes, for the same reasons:
 *
 *   - Non-overlap is structural rather than defensive. `setInterval` keeps
 *     firing while a tick is still in flight, so it needed a `running` flag and
 *     the extra fires were DROPPED: a tick that overran the interval lost its
 *     next slot entirely and the cadence went ragged under exactly the load that
 *     caused it. Scheduling the next tick only after the current one settles
 *     removes both the flag and the dropped slots.
 *   - The interval becomes a guaranteed IDLE gap rather than a start-to-start
 *     period, so a slow chain backs off naturally instead of queueing work it
 *     cannot keep up with.
 *
 * Deliberately no leading tick: `start()` runs in `onReady`, and firing an RPC
 * scan into a process that is still warming up buys nothing. Nothing is lost by
 * waiting — the cursor is durable, so the first tick scans exactly the range an
 * immediate one would have.
 */

import type { ChainId, ChainListener } from '@server/chains/types'

export interface IntervalListenerDeps {
  chain_id: ChainId
  interval_ms: number
  tick(): Promise<unknown>
  log: {
    info(obj: Record<string, unknown>, msg: string): void
    warn(obj: Record<string, unknown>, msg: string): void
  }
}

export function createIntervalListener(deps: IntervalListenerDeps): ChainListener {
  let timer: NodeJS.Timeout | null = null
  let stopped = false

  function schedule(): void {
    timer = setTimeout(runTick, deps.interval_ms)
    // Every timer, not just the first: with recursion each tick creates a new
    // one, and a single ref'd timer is enough to hold a draining process open.
    timer.unref()
  }

  async function runTick(): Promise<void> {
    try {
      await deps.tick()
    } catch (err) {
      deps.log.warn({ err, chain_id: deps.chain_id }, 'polling tick failed')
    }
    // Reschedule after a FAILURE too. This listener is the backstop under lost
    // client pings, so retiring it on one RPC blip would silently remove the
    // safety net for the rest of the process's life — the failure mode it exists
    // to prevent. `stopped` is checked here because a tick already in flight
    // when stop() ran must not resurrect the loop.
    if (!stopped) schedule()
  }

  return {
    async start() {
      stopped = false
      schedule()
      deps.log.info(
        { interval_ms: deps.interval_ms, chain_id: deps.chain_id },
        'polling listener started',
      )
    },
    async stop() {
      stopped = true
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}
