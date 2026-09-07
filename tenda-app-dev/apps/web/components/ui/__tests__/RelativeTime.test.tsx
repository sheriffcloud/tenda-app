/**
 * The one timestamp element. Two things are being protected here.
 *
 * The first is the PUBLIC page's premise: `/gig/[id]` and the feed must render
 * without the bundle, so the label has to be in the server-rendered HTML, not
 * appear only after hydration, and cost the server no timer per request.
 * Hydration over that HTML deliberately DOES report one recoverable error when
 * the clock crossed a label boundary in between — see `RelativeTime`'s header
 * for why that is the choice and what suppressing it would break — so the test
 * below asserts the warning AND the corrected text, rather than silence.
 *
 * The second is that the exact instant survives in the markup. A relative
 * label is imprecise by definition; `dateTime` is what a screen reader, a
 * crawler and a copy-paste get instead of the guess.
 */
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RelativeTime } from '@/components/ui/RelativeTime'

const POSTED = '2026-08-16T09:00:00.000Z'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-16T10:00:00.000Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('RelativeTime', () => {
  it('renders a <time> carrying the exact instant beside the relative label', () => {
    render(<RelativeTime iso={POSTED} />)
    const el = screen.getByText('1h')
    expect(el.tagName).toBe('TIME')
    expect(el).toHaveAttribute('dateTime', POSTED)
  })

  it('takes a className, so callers keep their own type treatment', () => {
    render(<RelativeTime iso={POSTED} className="font-numeric" />)
    expect(screen.getByText('1h')).toHaveClass('font-numeric')
  })

  it('puts the label in the SERVER-rendered HTML, not only after hydration', () => {
    // The public feed and gig detail are read by crawlers and by people with
    // the bundle disabled. A timestamp that existed only on the client would
    // be blank for both.
    const html = renderToString(<RelativeTime iso={POSTED} />)
    expect(html).toContain('1h')
    expect(html).toContain(POSTED)
  })

  it('starts NO timer during a server render', () => {
    // The public feed and gig detail render on the Node server on every
    // request. `useSyncExternalStore` never calls `subscribe` in the server
    // renderer, and this is what holds that: rewriting the hook as
    // `useState` + an effect, or reaching for a timer to seed the first
    // label, would arm one per request in a process that must stay idle
    // between them.
    const set = vi.spyOn(globalThis, 'setTimeout')
    renderToString(
      <div>
        <RelativeTime iso={POSTED} />
        <RelativeTime iso="2026-08-16T08:00:00.000Z" />
      </div>,
    )
    expect(set).not.toHaveBeenCalled()
  })

  it('CORRECTS a label the clock outran between the server render and hydration', () => {
    // The case `suppressHydrationWarning` would BREAK, which is why the
    // component does not carry it (see its header): the server writes the HTML
    // at one instant and the browser hydrates at a later one. Suppressed,
    // React keeps the server's stale text and stops diffing it — and because
    // the snapshot it holds is already the new label, no tick corrects it
    // until the label moves again. The card would read "now" for another
    // minute, which is the bug this component exists to fix.
    const fresh = '2026-08-16T09:59:10.000Z'
    const html = renderToString(<RelativeTime iso={fresh} />)
    expect(html).toContain('now')

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    // The minute rolls while the bundle is on the wire.
    vi.setSystemTime(new Date('2026-08-16T10:00:15.000Z'))

    // React reports ONE recoverable hydration error here, saying the clock
    // moved — which is true, and is the accepted cost of leaving the
    // suppression off. Taking it through `onRecoverableError` rather than a
    // console spy is what lets this be asserted instead of merely silenced;
    // React's default handler rethrows it as an unhandled rejection.
    const recovered: string[] = []
    let root: ReturnType<typeof hydrateRoot> | null = null
    act(() => {
      root = hydrateRoot(container, <RelativeTime iso={fresh} />, {
        onRecoverableError: (error) => {
          recovered.push(error instanceof Error ? error.message : String(error))
        },
      })
    })

    expect(recovered).toHaveLength(1)
    expect(recovered[0]).toContain("server rendered text didn't match")
    expect(container.querySelector('time')?.textContent).toBe('1m')

    // Torn down by hand: this root is outside RTL's registry, so nothing else
    // unmounts it — and a subscriber that outlives its test holds the shared
    // ticker open across the whole file.
    const mounted = root as ReturnType<typeof hydrateRoot> | null
    act(() => {
      mounted?.unmount()
    })
    container.remove()
  })

  it('keeps ticking after it is mounted', () => {
    render(<RelativeTime iso="2026-08-16T10:00:00.000Z" />)
    expect(screen.getByText('now')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    expect(screen.getByText('1m')).toBeInTheDocument()
  })
})
