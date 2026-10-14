import { useEffect, useState } from 'react'

/**
 * Becomes true after `delayMs` while active and resets immediately when
 * inactive. The reset is a render-time state adjustment (the React-docs
 * pattern) rather than a setState inside the effect, which web's stricter
 * effect lint disallows — mobile's copy keeps the effect form.
 */
export function useSlowOperation(active: boolean, delayMs: number): boolean {
  const [slow, setSlow] = useState(false)
  const [prevActive, setPrevActive] = useState(active)

  if (prevActive !== active) {
    setPrevActive(active)
    if (!active && slow) setSlow(false)
  }

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setSlow(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  return slow
}
