/**
 * The theme button, end to end through the real page: a click moves the reader
 * one step round System → Light → Dark → System, the page is stamped (or, back
 * on System, un-stamped) to match, and the label says where the next click goes.
 *
 * The hook and the header are each tested alone; this is the wiring between
 * them in App.tsx — the place a prop passed under the wrong name would leave
 * both of those suites green and the button dead.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '@/App'
import { installMatchMedia, type FakeMedia } from '@/test-support/match-media'

/**
 * These render the WHOLE documentation page, and the first one re-renders it on
 * every click. That is quick in a plain run and several times slower under v8
 * coverage instrumentation (measured: 5.6s against vitest's 5s default), so the
 * budget is stated rather than left to the default.
 */
const FULL_PAGE_MS = 30_000

let media: FakeMedia

beforeEach(() => {
  media = installMatchMedia('light')
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})
afterEach(() => { media.restore() })

const button = (): HTMLElement => screen.getByRole('button', { name: /^theme:/i })
const stamp = (): string | null => document.documentElement.getAttribute('data-theme')

describe('the theme button on the page', () => {
  it('walks System → Light → Dark → System, stamping the page to match', () => {
    render(<App />)
    expect(button().getAttribute('aria-label')).toBe('Theme: System. Switch to Light')
    expect(stamp()).toBeNull()

    fireEvent.click(button())
    expect(button().getAttribute('aria-label')).toBe('Theme: Light. Switch to Dark')
    expect(stamp()).toBe('light')

    fireEvent.click(button())
    expect(button().getAttribute('aria-label')).toBe('Theme: Dark. Switch to System')
    expect(stamp()).toBe('dark')

    // The way back: the reader is following their system again, not stuck on dark.
    fireEvent.click(button())
    expect(button().getAttribute('aria-label')).toBe('Theme: System. Switch to Light')
    expect(stamp()).toBeNull()
  }, FULL_PAGE_MS)

  it('the mark follows the RESOLVED side: a dark system on System mode shows the dark-ground mark', () => {
    media.restore()
    media = installMatchMedia('dark')
    const dark = render(<App />)
    const onDarkSystem = screen.getAllByRole('img')[0].getAttribute('src')
    dark.unmount()

    media.restore()
    media = installMatchMedia('light')
    render(<App />)
    expect(screen.getAllByRole('img')[0].getAttribute('src')).not.toBe(onDarkSystem)
  }, FULL_PAGE_MS)
})
