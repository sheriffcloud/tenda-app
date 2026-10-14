/**
 * @vitest-environment node
 *
 * The SERVER arm of `useIsomorphicLayoutEffect` (#46).
 *
 * A node environment because there is no other way to reach this branch: the
 * choice is made once, at module load, from `typeof window`, and jsdom always
 * has one. The repo already runs suites this way to prove SSR safety, and
 * `test/setup.tsx` guards its DOM patches for exactly that.
 *
 * What it protects is not academic. Both callers of `useGigFeedRealtime` sit
 * under server-rendered routes — the anonymous feed among them — and React logs
 * a warning for every `useLayoutEffect` it renders on the server. Picking the
 * layout effect unconditionally would put that warning on the app's most
 * SEO-critical page, on every request, which is how a "harmless" one gets
 * ignored until it hides a real one.
 */
import { useEffect, useLayoutEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { useIsomorphicLayoutEffect } from '@/hooks/timing/useIsomorphicLayoutEffect'

describe('useIsomorphicLayoutEffect on the server', () => {
  it('is the PASSIVE effect, so server rendering logs no warning', () => {
    expect(typeof window).toBe('undefined')
    expect(useIsomorphicLayoutEffect).toBe(useEffect)
    // Same reasoning as the browser file: implied by the identity above, so it
    // rides in this case instead of pretending to be an independent one.
    expect(useIsomorphicLayoutEffect).not.toBe(useLayoutEffect)
  })
})
