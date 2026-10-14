/**
 * Contract test for the motion layer in app/globals.css.
 *
 * Compiles the real stylesheet through the real @tailwindcss/postcss plugin
 * rather than asserting on source text — a regex over the CSS file would pass
 * even if Tailwind never emitted the utility, which is the failure that would
 * actually bite (a class name that silently does nothing).
 *
 * `@source inline(...)` supplies the class names, so the test never depends on
 * which components happen to use them yet.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'

// vitest's root is apps/web (vitest.config.ts sits there), and under jsdom
// import.meta.url is not a file: URL — so resolve from cwd, then assert it.
const WEB_ROOT = `${process.cwd()}/`
const GLOBALS = `${WEB_ROOT}app/globals.css`

/** The animations the comps actually specify, after de-duplication. */
const ANIMATIONS = ['fadein', 'popin', 'shimmer', 'arrive'] as const

let css = ''

beforeAll(async () => {
  // A wrong cwd would otherwise surface as every assertion failing on an
  // empty string; fail loudly on the real cause instead.
  expect(existsSync(GLOBALS), `globals.css not found at ${GLOBALS}`).toBe(true)
  const require_ = createRequire(WEB_ROOT)
  const postcss = require_('postcss')
  const tailwind = require_('@tailwindcss/postcss')
  const source = `${readFileSync(GLOBALS, 'utf8')}
@source inline("animate-{${[...ANIMATIONS, 'spin'].join(',')}}");
`
  const result = await postcss([tailwind()]).process(source, { from: GLOBALS })
  css = result.css
}, 60_000)

const utility = (name: string) => new RegExp(`\\.animate-${name}\\s*\\{([^}]*)\\}`)

/** `\b` is not enough: /@keyframes popin\b/ happily matches `popin-renamed`. */
const keyframe = (name: string) => new RegExp(`@keyframes ${name}\\s*\\{`)

describe('motion keyframes', () => {
  it.each(ANIMATIONS)('defines @keyframes %s', (name) => {
    expect(css).toMatch(keyframe(name))
  })

  it('does not define spin — Tailwind ships it and Spinner.tsx uses the built-in', () => {
    // Two definitions would mean we shadowed the framework's keyframe; zero
    // would mean animate-spin resolves to nothing.
    expect(css.match(/@keyframes spin\s*\{/g)).toHaveLength(1)
  })

  it('does not reintroduce `phase`, the comps\' duplicate of fadein', () => {
    expect(css).not.toMatch(keyframe('phase'))
  })

  it('animates arrive through background-color, not the background shorthand', () => {
    // The shorthand also resets background-image/size/position for the
    // duration, blanking any row that carries one.
    const block = css.match(/@keyframes arrive\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toMatch(/background-color:/)
    expect(block).not.toMatch(/(^|[^-])background:/m)
  })

  it('drives fadein travel from --motion-rise, not a hardcoded distance', () => {
    const block = css.match(/@keyframes fadein\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toContain('var(--motion-rise')
    expect(block).not.toMatch(/translateY\(\s*\d/)
  })
})

describe('animation utilities', () => {
  it.each(ANIMATIONS)('emits a working .animate-%s utility', (name) => {
    const match = css.match(utility(name))
    expect(match, `.animate-${name} was never emitted`).not.toBeNull()
    // The declaration must reference its keyframe, not an undefined variable.
    expect(match?.[1]).toContain(name)
  })

  it.each(ANIMATIONS)('resolves %s timing from motion tokens, never a literal', (name) => {
    const declaration = css.match(utility(name))?.[1] ?? ''
    expect(declaration).toMatch(/var\(--motion-|var\(--ease-/)
    expect(declaration, 'a raw ms/s literal means the token was bypassed').not.toMatch(
      /\b\d+m?s\b/,
    )
  })

  it('still emits Tailwind\'s own animate-spin', () => {
    expect(css).toMatch(utility('spin'))
  })

  it('every animation an .animate-* utility names has a real @keyframes', () => {
    // The invariant that actually matters, and the one a per-name assertion
    // misses: a utility pointing at a renamed or deleted keyframe compiles
    // fine and silently does nothing at runtime.
    const referenced = new Set<string>()
    for (const [, body] of css.matchAll(/\.animate-[a-z-]+\s*\{([^}]*)\}/g)) {
      // `animation: <name> ...` or `animation: var(--animate-<name>)`
      const direct = body.match(/animation:\s*([a-z][a-z0-9-]*)/i)?.[1]
      if (direct !== undefined && direct !== 'var') referenced.add(direct)
    }
    expect(referenced.size).toBeGreaterThan(0)
    for (const name of referenced) {
      expect(css, `.animate-* references "${name}" but no @keyframes defines it`).toMatch(
        keyframe(name),
      )
    }
  })
})

describe('namespace safety', () => {
  it('does not override Tailwind\'s --ease-* theme tokens', () => {
    // Declaring --ease-out ourselves silently re-curves every `ease-out`
    // utility app-wide. Tailwind's value must survive intact.
    expect(css).toMatch(/--ease-out:\s*cubic-bezier\(0,\s*0,\s*0\.2,\s*1\)/)
    expect(css).not.toMatch(/--ease-out:\s*ease-out/)
    expect(css).not.toMatch(/--ease-in-out:\s*ease-in-out/)
  })

  it('keeps its own easings under the --motion-ease-* namespace', () => {
    for (const token of ['--motion-ease-standard', '--motion-ease-out', '--motion-ease-in-out']) {
      expect(css).toMatch(new RegExp(`${token}:`))
    }
  })
})

describe('motion tokens', () => {
  it.each([
    ['--motion-fast', '100ms'],
    ['--motion-base', '120ms'],
    ['--motion-slow', '160ms'],
    ['--motion-shimmer', '1400ms'],
    ['--motion-rise', '4px'],
  ])('declares %s', (token, value) => {
    expect(css).toMatch(new RegExp(`${token}:\\s*${value}`))
  })

})

describe('reduced-motion guard', () => {
  it('honours prefers-reduced-motion', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
  })

  it('collapses durations instead of cancelling animations outright', () => {
    // `animation: none` would suppress animationend/transitionend, hanging any
    // caller awaiting them. Collapsing to ~0 removes the motion and still fires.
    const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).not.toBe('')
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/)
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
    expect(block).not.toMatch(/animation:\s*none/)
  })

  it('stops infinite animations rather than looping them at 0.01ms', () => {
    // Without this, `shimmer ... infinite` keeps cycling forever under
    // reduced motion — just imperceptibly fast, which is not the point.
    const block =
      css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/)
  })
})
