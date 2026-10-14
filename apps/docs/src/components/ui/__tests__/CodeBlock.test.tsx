/**
 * A body long enough to bury the page opens collapsed — and every body, long
 * or short, can be taken away whole.
 *
 * The recorded 402 is the sample that matters most and the one that runs
 * longest; shown whole it pushes every other response off the screen. What is
 * tested is the behaviour, not the height: the control appears only when there
 * is something to expand, it says how much, and it opens.
 *
 * The copy control is tested for the thing that would silently go wrong — it
 * must hand over the WHOLE body while the block is still collapsed. A partial
 * paste of a signed envelope is refused by the server for reasons nothing on
 * screen would explain.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOCS_COPY } from '@/content'
import { CodeBlock, COLLAPSE_OVER_LINES } from '@/components/ui/CodeBlock'

/** An object whose pretty-printed form is `fields + 2` lines long. */
const body = (fields: number) => Object.fromEntries(Array.from({ length: fields }, (_, i) => [`field_${i}`, i]))

/**
 * Sizes stated OUTRIGHT rather than derived from COLLAPSE_OVER_LINES. Sized
 * from the constant, these cases scale with it: the threshold could be raised
 * to nine thousand and every one of them would still pass, which is a suite
 * that cannot see the limit it exists to guard.
 */
const SHORT = 3
const LONG = 30

/** jsdom exposes no clipboard, so the copy cases install the one they need. */
function installClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

afterEach(() => { Reflect.deleteProperty(navigator, 'clipboard') })

const expandControl = () => screen.getByRole('button', { name: /Show all|Collapse/ })

describe('CodeBlock', () => {
  it('shows a short body whole, with no control to press', () => {
    render(<CodeBlock value={body(SHORT)} label="Recorded" />)
    expect(screen.getByText(/field_0/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('cuts in between the two sizes the other cases use', () => {
    // The threshold is the whole behaviour; without this the suite passes at
    // any value of it. SHORT must sit under it and LONG over it.
    expect(SHORT + 2).toBeLessThanOrEqual(COLLAPSE_OVER_LINES)
    expect(LONG + 2).toBeGreaterThan(COLLAPSE_OVER_LINES)
  })

  it('collapses a long one and says how much is hidden', async () => {
    render(<CodeBlock value={body(LONG)} label="Recorded" />)
    expect(expandControl().textContent).toMatch(/Show all \d+ lines/)

    await userEvent.click(expandControl())
    expect(expandControl().textContent).toBe(DOCS_COPY.collapse)

    await userEvent.click(expandControl())
    expect(expandControl().textContent).toMatch(/Show all/)
  })

  it('still offers the control on a long body with no label', async () => {
    // The bar used to render only for a labelled block, so an unlabelled long
    // body was collapsed with no way to open it — permanently truncated.
    render(<CodeBlock value={body(LONG)} />)
    expect(expandControl().textContent).toMatch(/Show all \d+ lines/)

    await userEvent.click(expandControl())
    expect(expandControl().textContent).toBe(DOCS_COPY.collapse)
  })

  it('draws no bar at all when there is no label, nothing to expand and no clipboard', () => {
    // All three, because any one of them is reason enough for a bar. This is
    // the state of a short unlabelled body on a page served over http://.
    const { container } = render(<CodeBlock value={body(SHORT)} />)
    expect(screen.queryByRole('button')).toBeNull()
    // One child: the <pre>. A bar would be a second.
    expect(container.firstElementChild?.children.length).toBe(1)
  })

  it('draws the bar for the copy control alone, when that is all there is', () => {
    installClipboard(vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined))
    const { container } = render(<CodeBlock value={body(SHORT)} />)
    expect(container.firstElementChild?.children.length).toBe(2)
    expect(screen.getByRole('button', { name: DOCS_COPY.copyBody })).toBeTruthy()
  })

  it('clips BOTH axes while collapsed, so the page keeps the wheel', () => {
    // MEASURED in Chrome: `overflow-y: hidden` still makes the box a scroll
    // container, and `overflow-y: clip` beside `overflow-x: auto` computes
    // straight back to `hidden`. Either way a wheel over a collapsed sample
    // scrolls the sample and the page stays put. jsdom computes no overflow,
    // so what is held here is the DECLARED value — the thing that regressed.
    const { container } = render(<CodeBlock value={body(LONG)} label="Recorded" />)
    const pre = container.querySelector('pre')
    expect(pre?.style.overflow).toBe('clip')
    expect(pre?.style.overflowY, 'a single-axis clip computes back to hidden').toBe('')
  })

  it('lets an expanded body scroll sideways again, for a value wider than the column', async () => {
    render(<CodeBlock value={body(LONG)} label="Recorded" />)
    await userEvent.click(expandControl())
    const pre = screen.getByText(/field_0/).closest('pre')
    expect(pre?.style.overflow).toBe('')
    expect(pre?.className).toContain('overflow-x-auto')
  })

  it('hands over the WHOLE body while the block is still collapsed', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    installClipboard(writeText)

    render(<CodeBlock value={body(LONG)} label="Recorded" />)
    // Still collapsed: the expand control has not been touched.
    expect(expandControl().textContent).toMatch(/Show all/)

    // fireEvent, not userEvent: userEvent's implicit setup installs a clipboard
    // stub of its own and would replace the spy this case is measuring.
    fireEvent.click(screen.getByRole('button', { name: DOCS_COPY.copyBody }))
    await waitFor(() => { expect(writeText).toHaveBeenCalled() })
    const copied = writeText.mock.calls[0]?.[0] ?? ''
    expect(copied.split('\n')).toHaveLength(LONG + 2)
    expect(copied).toContain(`"field_${LONG - 1}"`)
  })
})
