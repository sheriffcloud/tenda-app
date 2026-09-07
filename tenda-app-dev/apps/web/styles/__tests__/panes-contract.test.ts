/**
 * Contract test for the workspace pane grid in app/globals.css.
 *
 * jsdom does not evaluate media queries, so the ≤1100/≤900px collapse cannot
 * be proven by rendering. Compile the real stylesheet instead and assert the
 * rules exist — this is the only place that behaviour is checkable at all.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'

const WEB_ROOT = `${process.cwd()}/`
const GLOBALS = `${WEB_ROOT}app/globals.css`

let css = ''

beforeAll(async () => {
  expect(existsSync(GLOBALS), `globals.css not found at ${GLOBALS}`).toBe(true)
  const require_ = createRequire(WEB_ROOT)
  const postcss = require_('postcss')
  const tailwind = require_('@tailwindcss/postcss')
  const result = await postcss([tailwind()]).process(readFileSync(GLOBALS, 'utf8'), {
    from: GLOBALS,
  })
  css = result.css
}, 60_000)

/** Body of the first `@media (max-width: <px>)` block, or '' if absent. */
function mediaBlock(maxWidth: number): string {
  const re = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidth}px\\)\\s*\\{([\\s\\S]*?)\\n\\}`)
  return css.match(re)?.[1] ?? ''
}

describe('pane geometry tokens', () => {
  it.each([
    ['--pane-rail', '64px'],
    ['--pane-list', '380px'],
    ['--pane-list-compact', '320px'],
  ])('declares %s', (token, value) => {
    expect(css).toMatch(new RegExp(`${token}:\\s*${value}`))
  })

  it('drives the grid from the tokens rather than repeating the widths', () => {
    const block = css.match(/\[data-panes\]\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toContain('var(--pane-rail)')
    expect(block).toContain('var(--pane-list)')
    expect(block).toMatch(/minmax\(0,\s*1fr\)/)
  })

  it('locks the grid height and lets the panes scroll, not the page', () => {
    const block = css.match(/\[data-panes\]\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toMatch(/overflow:\s*hidden/)
    // dvh, not vh: vh ignores a retracting mobile URL bar and strands the
    // last rows of a pane below the fold.
    expect(block).toMatch(/height:\s*100dvh/)
    expect(block).not.toMatch(/height:\s*100vh/)
  })
})

describe('≤1100px — the list narrows before it disappears', () => {
  it('swaps the list column for the compact width', () => {
    const block = mediaBlock(1100)
    expect(block).toContain('var(--pane-list-compact)')
    expect(block).toContain('var(--pane-rail)')
  })
})

describe('≤900px — one pane at a time', () => {
  it('collapses to two columns', () => {
    expect(mediaBlock(900)).toMatch(
      /\[data-panes\]\s*\{\s*grid-template-columns:\s*var\(--pane-rail\)\s+minmax\(0,\s*1fr\)/,
    )
  })

  it('hides the list by default, because a detail is showing', () => {
    expect(mediaBlock(900)).toMatch(/\[data-panes\]\s*\[data-list\]\s*\{\s*display:\s*none/)
  })

  it('shows the list instead when nothing is selected', () => {
    expect(mediaBlock(900)).toMatch(
      /\[data-panes\]\[data-nodetail\]\s*\[data-list\]\s*\{\s*display:\s*flex/,
    )
  })

  it('hides the detail when nothing is selected, so the two never stack', () => {
    expect(mediaBlock(900)).toMatch(
      /\[data-panes\]\[data-nodetail\]:has\(\[data-list\]\)\s*\[data-detail\]\s*\{\s*display:\s*none/,
    )
  })

  it('only hides the detail when a list exists to replace it', () => {
    // Without the :has() guard, a list-less surface renders an empty pane —
    // a blank screen on every narrow viewport.
    const block = mediaBlock(900)
    const detailHide = block.match(/\[data-panes\]\[data-nodetail\][^{]*\[data-detail\]\s*\{[^}]*\}/)
    expect(detailHide?.[0]).toContain(':has([data-list])')
  })

  it('does not breakpoint-gate the persistent breadcrumb', () => {
    expect(mediaBlock(900)).not.toMatch(/\[data-pane-back\]/)
  })
})

describe('list-less surfaces', () => {
  it('collapse to rail + content at every width', () => {
    expect(css).toMatch(
      /\[data-panes\]:not\(:has\(\[data-list\]\)\)\s*\{\s*grid-template-columns:\s*var\(--pane-rail\)\s+minmax\(0,\s*1fr\)/,
    )
  })

  it('reads the DOM rather than a flag, because the @list slot is never empty as a prop', () => {
    // Next wraps parallel-slot output in boundary elements, so a JS check
    // cannot distinguish an empty slot from a real list.
    expect(css).not.toMatch(/\[data-nolist\]/)
  })
})

describe('breadcrumb default', () => {
  it('stays visible outside the single-pane breakpoint', () => {
    const withoutMedia = css.replace(/@media[\s\S]*?\n\}/g, '')
    expect(withoutMedia).not.toMatch(/\[data-pane-back\]/)
  })
})
