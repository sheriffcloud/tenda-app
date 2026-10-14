'use client'

/**
 * Milliseconds remaining to a deadline, re-sampled once a second.
 *
 * The ticking lives here and the PRESENTATION lives in its callers — mobile
 * splits it the same way (`useCountdown` + `DeadlineCountdown`). Two callers
 * need it: the inline clock in a terms row, and the exchange's countdown block,
 * whose whole panel changes colour as the window runs out. They agree on the
 * numbers because they agree on this hook and on shared's `formatHMS` /
 * `countdownTone`; they differ only in layout.
 *
 * Recursive `setTimeout`, never `setInterval` (project rule — the delay is an
 * idle gap, and non-overlap is structural), and it stops at zero rather than
 * counting into negative numbers nobody displays.
 */
import { useEffect, useState } from 'react'

function remainingMs(deadline: Date | string): number {
  return new Date(deadline).getTime() - Date.now()
}

export function useCountdown(deadline: Date | string): number {
  const [remaining, setRemaining] = useState(() => remainingMs(deadline))

  // A deadline PROP change resamples immediately (adjust-state-during-render,
  // the sanctioned derived-state pattern) — waiting for the next tick would
  // show the old deadline's clock for up to a second.
  const [lastDeadline, setLastDeadline] = useState(deadline)
  if (deadline !== lastDeadline) {
    setLastDeadline(deadline)
    setRemaining(remainingMs(deadline))
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = () => {
      const next = remainingMs(deadline)
      setRemaining(next)
      if (next > 0) timer = setTimeout(tick, 1_000)
    }
    // First correction rides the first tick (the initializer already sampled
    // the clock) — a sync setState in the effect trips the cascading lint.
    timer = setTimeout(tick, 1_000)
    return () => {
      if (timer !== null) clearTimeout(timer)
    }
  }, [deadline])

  return remaining
}
