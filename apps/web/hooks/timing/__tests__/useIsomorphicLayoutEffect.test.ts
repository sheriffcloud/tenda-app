/**
 * The BROWSER arm of `useIsomorphicLayoutEffect` (#46).
 *
 * The whole point of the hook is that a ref mirroring the latest render is
 * current before React yields, so a socket callback cannot read a stale one —
 * and only a layout effect gives that. If this ever silently became the passive
 * effect, `useGigFeedRealtime` would go back to dropping rows and applying
 * superseded frames about one run in ten, which is a shape of bug that survives
 * a long time precisely because it usually passes.
 *
 * Its server counterpart lives in `.ssr.test.ts` under a node environment: the
 * choice is made once at module load, so the two arms cannot share a file.
 */
import { useEffect, useLayoutEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { useIsomorphicLayoutEffect } from '@/hooks/timing/useIsomorphicLayoutEffect'

describe('useIsomorphicLayoutEffect in the browser', () => {
  it('is the LAYOUT effect, which runs inside the commit', () => {
    expect(typeof window).not.toBe('undefined')
    expect(useIsomorphicLayoutEffect).toBe(useLayoutEffect)
    // The contrast, in the same case rather than its own: React's two exports
    // are distinct, so the identity above already implies this. Split out it
    // could never fail alone, which is a second guard in name only.
    expect(useIsomorphicLayoutEffect).not.toBe(useEffect)
  })
})
