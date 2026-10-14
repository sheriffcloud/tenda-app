/**
 * The landing's Button is mobile's Button.tsx in the DOM: the generated
 * `type-button` atom for the face, mobile's per-size label override (sm and
 * md read 14/18, lg keeps the atom's 15/20), mobile's radii by size, and the
 * anchor/button split on `href`. Static markup, like every suite here — the
 * classes are the contract and need no DOM to read.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Button } from '../Button'

/** The class attribute of the one element the markup holds. */
function classesOf(markup: string): string {
  return markup.match(/class="([^"]*)"/)?.[1] ?? ''
}

describe('Button', () => {
  it('sets the face through the generated atom, never its own numbers', () => {
    const cls = classesOf(renderToStaticMarkup(<Button size="lg">Open the web app</Button>))
    expect(cls).toMatch(/(?:^| )type-button(?: |$)/)
    // No restated size or tracking outside the per-size override.
    expect(cls).not.toMatch(/text-\[15px\]|leading-5\b|tracking-\[/)
  })

  it('overrides the label per size exactly as mobile does: sm and md 14/18, lg the atom', () => {
    const md = classesOf(renderToStaticMarkup(<Button size="md">Go</Button>))
    expect(md).toContain('rounded-[var(--radius-button)]')
    expect(md).toContain('text-[14px] leading-[18px]')

    const sm = classesOf(renderToStaticMarkup(<Button size="sm">Go</Button>))
    expect(sm).toContain('text-[14px] leading-[18px]')

    const lg = classesOf(renderToStaticMarkup(<Button size="lg">Go</Button>))
    expect(lg).toContain('rounded-[var(--radius-button-lg)]')
    expect(lg).not.toMatch(/text-\[14px\]|leading-\[18px\]/)
  })

  it('renders an anchor when given an href and a button otherwise', () => {
    expect(renderToStaticMarkup(<Button href="/app">Open</Button>)).toMatch(/^<a [^>]*href="\/app"/)
    expect(renderToStaticMarkup(<Button>Press</Button>)).toMatch(/^<button /)
  })
})
