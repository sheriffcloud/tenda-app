import { useEffect, useState } from 'react'

/** Becomes true after `delayMs` while active and resets immediately when inactive. */
export function useSlowOperation(active: boolean, delayMs: number): boolean {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    setSlow(false)
    if (!active) return
    const timer = setTimeout(() => setSlow(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  return slow
}
