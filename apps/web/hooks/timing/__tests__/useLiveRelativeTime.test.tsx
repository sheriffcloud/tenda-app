/**
 * The page-wide clock behind every relative timestamp.
 *
 * The regression it exists for is a label that stops being true: a gig posted
 * while the reader watched said "Posted now" for as long as the page stayed
 * open, because `formatRelativeShort` was sampled once at render and never
 * again. So the first property under test is simply that it TICKS.
 *
 * The other three are what stop the fix from costing more than the bug: one
 * timer for the whole page, no re-render on a tick that changes nothing, and
 * no timer at all once the last timestamp unmounts.
 */
import { Profiler, useEffect, useState } from 'react'
import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLiveRelativeTime } from '@/hooks/timing/useLiveRelativeTime'

const POSTED = '2026-08-16T10:00:00.000Z'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(POSTED))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useLiveRelativeTime', () => {
  it('reads the clock on the first render, before any tick', () => {
    // A hook that answered nothing until its first timer fired would paint a
    // blank where the timestamp goes, on every server-rendered page.
    const { result } = renderHook(() => useLiveRelativeTime(POSTED))
    expect(result.current).toBe('now')
  })

  it('stops saying "now" once it stops being now', () => {
    const { result } = renderHook(() => useLiveRelativeTime(POSTED))
    expect(result.current).toBe('now')
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    expect(result.current).toBe('1m')
    act(() => {
      vi.advanceTimersByTime(60 * 60_000)
    })
    expect(result.current).toBe('1h')
  })

  it('re-reads the clock when the instant it was given changes', () => {
    const { result, rerender } = renderHook(({ at }: { at: string }) => useLiveRelativeTime(at), {
      initialProps: { at: POSTED },
    })
    expect(result.current).toBe('now')
    rerender({ at: '2026-08-16T08:00:00.000Z' })
    expect(result.current).toBe('2h')
  })

  it('runs ONE timer no matter how many timestamps are on the page', () => {
    // A feed is twenty cards. Twenty timers waking independently is twenty
    // times the work for the same second.
    function Stamp({ iso }: { iso: string }) {
      return <span>{useLiveRelativeTime(iso)}</span>
    }
    const set = vi.spyOn(globalThis, 'setTimeout')
    render(
      <>
        <Stamp iso={POSTED} />
        <Stamp iso={POSTED} />
        <Stamp iso={POSTED} />
      </>,
    )
    expect(set).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    // One more: the recursive re-schedule, not one per subscriber.
    expect(set).toHaveBeenCalledTimes(2)
  })

  it('does NOT re-render on a tick that changes nothing it would print', () => {
    // The snapshot is the formatted STRING precisely so React's bail-out does
    // this filtering. Most ticks change nothing for most timestamps, and a
    // feed that re-rendered every card every ten seconds would be a worse
    // problem than the one being fixed.
    // Counted with `Profiler` rather than a `renders += 1` in the body: that
    // is a side effect during render, and the react-hooks lint refuses it.
    // Commits are the better measure anyway — a bail-out is precisely a tick
    // that produces none.
    let commits = 0
    function Stamp() {
      return <span data-testid="stamp">{useLiveRelativeTime(POSTED)}</span>
    }
    render(
      <Profiler id="stamp" onRender={() => { commits += 1 }}>
        <Stamp />
      </Profiler>,
    )
    const initial = commits
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(commits).toBe(initial)
    expect(screen.getByTestId('stamp')).toHaveTextContent('now')

    // …and it DOES re-render on the tick that crosses a boundary.
    act(() => {
      vi.advanceTimersByTime(31_000)
    })
    expect(commits).toBeGreaterThan(initial)
    expect(screen.getByTestId('stamp')).toHaveTextContent('1m')
  })

  it('leaves no runaway timer when the last subscriber unmounts BECAUSE of a tick', () => {
    // The hook's `schedule()` deliberately carries no "is anyone still
    // subscribed" guard, on the argument that React commits unmounts after the
    // notify loop returns rather than inside it — so the re-schedule can never
    // run against an emptied set. That is a claim about React's scheduling,
    // and this is what holds it: if it were false, a timer would keep waking
    // for the life of the page with nobody listening.
    function Stamp({ onLabel }: { onLabel: (label: string) => void }) {
      const label = useLiveRelativeTime(POSTED)
      useEffect(() => {
        onLabel(label)
      }, [label, onLabel])
      return <span>{label}</span>
    }
    function Host() {
      const [gone, setGone] = useState(false)
      return gone ? null : (
        <Stamp
          onLabel={(label) => {
            if (label !== 'now') setGone(true)
          }}
        />
      )
    }

    const set = vi.spyOn(globalThis, 'setTimeout')
    render(<Host />)
    expect(set).toHaveBeenCalledTimes(1)

    // The tick that flips now → 1m is also what unmounts the only subscriber.
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    set.mockClear()
    act(() => {
      vi.advanceTimersByTime(600_000)
    })
    expect(set).not.toHaveBeenCalled()
  })

  it('stops the timer when the last timestamp unmounts', () => {
    function Stamp() {
      return <span>{useLiveRelativeTime(POSTED)}</span>
    }
    const set = vi.spyOn(globalThis, 'setTimeout')
    const first = render(<Stamp />)
    const second = render(<Stamp />)
    expect(set).toHaveBeenCalledTimes(1)

    // One subscriber left: the timer must keep running.
    first.unmount()
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(set).toHaveBeenCalledTimes(2)

    second.unmount()
    set.mockClear()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(set).not.toHaveBeenCalled()
  })
})
