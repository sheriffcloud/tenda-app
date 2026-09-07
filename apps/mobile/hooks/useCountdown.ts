import { useEffect, useState } from 'react'

/**
 * Live millisecond countdown to `deadline`, re-rendering once per second.
 * Returns remaining ms clamped at 0, or null when there is no deadline.
 *
 * The interval clears itself the moment the deadline passes, so a screen left
 * open on an expired offer doesn't tick (or re-render) forever. Re-syncs
 * immediately whenever the deadline prop changes.
 */
export function useCountdown(deadline: Date | string | null): number | null {
  const target = deadline == null ? null : new Date(deadline).getTime()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (target === null) return
    setNow(Date.now())
    if (target <= Date.now()) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= target) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [target])

  if (target === null) return null
  return Math.max(0, target - now)
}
