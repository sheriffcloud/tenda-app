/**
 * The one clock behind both countdown presentations.
 *
 * Two properties matter: it ticks (a countdown that does not is a timestamp),
 * and it STOPS at zero — a clock that kept running would hand its callers
 * ever-larger negative numbers, and `countdownTone` cannot distinguish "just
 * expired" from "expired an hour ago" in anything it renders.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountdown } from '@/hooks/timing/useCountdown'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-16T10:00:00.000Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useCountdown', () => {
  it('samples the remaining time on the FIRST render, before any tick', () => {
    // The initialiser has to do this: a hook that returned 0 until its first
    // timer fired would paint an expired clock for a whole second.
    const { result } = renderHook(() => useCountdown('2026-08-16T10:00:05.000Z'))
    expect(result.current).toBe(5_000)
  })

  it('ticks down once a second', () => {
    const { result } = renderHook(() => useCountdown('2026-08-16T10:00:05.000Z'))
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(result.current).toBe(3_000)
  })

  it('stops scheduling once it reaches zero', () => {
    const { result } = renderHook(() => useCountdown('2026-08-16T10:00:02.000Z'))
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    const atZero = result.current
    expect(atZero).toBeLessThanOrEqual(0)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    // Unchanged: no timer is still running to drive it further negative.
    expect(result.current).toBe(atZero)
  })

  it('re-samples IMMEDIATELY when the deadline prop changes', () => {
    // Waiting for the next tick would show the previous deadline's clock for
    // up to a second — visible on an offer page that refetches after a
    // transition and gets a new window.
    const { result, rerender } = renderHook(({ at }: { at: string }) => useCountdown(at), {
      initialProps: { at: '2026-08-16T10:00:05.000Z' },
    })
    expect(result.current).toBe(5_000)
    rerender({ at: '2026-08-16T11:00:00.000Z' })
    expect(result.current).toBe(3_600_000)
  })

  it('clears its timer on unmount', () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = renderHook(() => useCountdown('2026-08-16T11:00:00.000Z'))
    unmount()
    expect(clear).toHaveBeenCalled()
  })
})
