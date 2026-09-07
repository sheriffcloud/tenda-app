import { useState } from 'react'

/**
 * The render's clock, sampled once per mount — satisfies the purity lint
 * (Date.now() in render) for deadline gates. Live ticking arrives with the
 * S5.4 live-refresh work; a mount-time sample is honest for gates that are
 * re-derived on every refetch.
 */
export function useNow(): number {
  const [now] = useState(() => Date.now())
  return now
}
