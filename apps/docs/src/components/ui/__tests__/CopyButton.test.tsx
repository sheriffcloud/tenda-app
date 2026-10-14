/**
 * The copy control, at the three outcomes it can actually have.
 *
 * The point of the component is that it never CLAIMS a copy it did not make:
 * a browser can refuse `clipboard-write` (an insecure origin, a permissions
 * policy), and a control that flashed "Copied" over a rejected write would be
 * worse than no control at all. So the refusal path is tested as hard as the
 * happy one, and the case where the API is absent entirely is tested too —
 * there the control must not render, rather than render dead.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOCS_COPY } from '@/content'
import { COPY_FEEDBACK_MS, COPY_TIMEOUT_MS, CopyButton } from '@/components/ui/CopyButton'
import { canCopy } from '@/lib/clipboard'

/** jsdom ships no clipboard, so each case installs exactly the one it needs. */
function installClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
  vi.useRealTimers()
})

describe('CopyButton', () => {
  it('renders nothing where the browser exposes no clipboard', () => {
    // The default state of this environment, and the real state of any page
    // served over http:// — a dead button there is a worse answer than none.
    expect(canCopy()).toBe(false)
    const { container } = render(<CopyButton value="/v1/gigs" title="Copy" />)
    expect(container.firstChild).toBeNull()
  })

  it('writes the value it was given, and says it did', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    installClipboard(writeText)

    render(<CopyButton value="http://localhost:3000/v1/agent/tasks" title="Copy the full URL" />)
    fireEvent.click(screen.getByRole('button'))

    expect(await screen.findByText(DOCS_COPY.copied)).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/v1/agent/tasks')
  })

  it('says a refused write was refused, and how to copy anyway', async () => {
    installClipboard(vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('denied')))

    render(<CopyButton value="/v1/gigs" title="Copy the full URL" />)
    fireEvent.click(screen.getByRole('button'))

    const button = await screen.findByText(DOCS_COPY.copyRefused)
    expect(button.getAttribute('title')).toBe(DOCS_COPY.copyRefusedHint)
  })

  it('returns to its label once the verdict has been read', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    installClipboard(vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined))

    render(<CopyButton value="/v1/gigs" title="Copy" />)
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByText(DOCS_COPY.copied)).toBeTruthy()

    // Inside act: the reset happens in a timer callback, and a state change
    // React never flushed would leave this reading the stale label.
    await act(async () => { await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS) })
    expect(screen.getByRole('button').textContent).toBe(DOCS_COPY.copy)
  })

  it('reports a write that never settles, rather than saying nothing at all', async () => {
    // MEASURED in Chrome on the built page: `writeText` returned a promise
    // still pending after three seconds, with `clipboard-write` granted, a
    // secure origin and the document focused. Without the deadline the control
    // sits on its idle label for ever and the reader has no idea whether the
    // body is on their clipboard.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    installClipboard(() => new Promise<void>(() => { /* never settles */ }))

    render(<CopyButton value="/v1/gigs" title="Copy the full URL" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toBe(DOCS_COPY.copy)

    await act(async () => { await vi.advanceTimersByTimeAsync(COPY_TIMEOUT_MS) })
    expect(screen.getByRole('button').textContent).toBe(DOCS_COPY.copyRefused)
  })

  it('says nothing once the row it sits in is gone, however late the write lands', async () => {
    // The deadline bounds how long a pending write runs, not whether the row
    // outlives it. A verdict arriving after the unmount must set no state and
    // arm no reset — the second is the observable one.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let land = (): void => undefined
    installClipboard(() => new Promise<void>((resolve) => { land = () => { resolve() } }))

    const { unmount } = render(<CopyButton value="/v1/gigs" title="Copy" />)
    fireEvent.click(screen.getByRole('button'))
    unmount()

    const arm = vi.spyOn(globalThis, 'setTimeout')
    await act(async () => { land(); await vi.advanceTimersByTimeAsync(0) })
    expect(arm, 'a verdict after unmount armed a reset on a component that is gone').not.toHaveBeenCalled()
    arm.mockRestore()
  })

  it('restarts the verdict window on a second copy, rather than letting the first reset it', async () => {
    // Two copies in quick succession: without dropping the first reset, it
    // fires on ITS schedule and blanks the second verdict early — the reader
    // sees "Copied" flash away a fraction of a second after clicking.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    installClipboard(vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined))

    render(<CopyButton value="/v1/gigs" title="Copy" />)
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByText(DOCS_COPY.copied)).toBeTruthy()

    await act(async () => { await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS - 600) })
    fireEvent.click(screen.getByRole('button'))
    await act(async () => { await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS - 600) })
    expect(screen.getByRole('button').textContent, 'the first reset outlived the second copy').toBe(DOCS_COPY.copied)

    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(screen.getByRole('button').textContent).toBe(DOCS_COPY.copy)
  })

  it('drops its timer when the row it sits in goes away', async () => {
    // Every one of these lives inside an operation or a response row. A timer
    // that outlives its component sets state on nothing and React says so.
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    installClipboard(vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined))

    const { unmount } = render(<CopyButton value="/v1/gigs" title="Copy" />)
    fireEvent.click(screen.getByRole('button'))
    await screen.findByText(DOCS_COPY.copied)

    clear.mockClear()
    unmount()
    expect(clear).toHaveBeenCalled()
    clear.mockRestore()
  })
})
