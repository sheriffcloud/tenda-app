/**
 * styles/type.css is the landing's class names over the GENERATED `type-*`
 * utilities. Two things must hold or the sheet silently drifts from mobile:
 * every `@apply type-<atom>` names a utility the generated sheet defines,
 * and every atom mobile has an exact twin for is APPLIED rather than typed
 * by hand — the hand-kept set is exactly the landing-only scaling atoms.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const STYLES = fileURLToPath(new URL('../styles/', import.meta.url))
const join = (dir: string, file: string) => dir + file
const typeSheet = readFileSync(join(STYLES, 'type.css'), 'utf8')
const tokens = readFileSync(join(STYLES, 'tokens.css'), 'utf8')

const generated = new Set([...tokens.matchAll(/@utility type-([a-z0-9-]+) \{/g)].map((m) => m[1]))
const applied = [...typeSheet.matchAll(/@apply type-([a-z0-9-]+)/g)].map((m) => m[1])

/** Landing class → generated atom, for every class with an exact mobile twin. */
const EXACT: Readonly<Record<string, string>> = {
  h3: 'h3',
  title: 'title',
  body: 'body',
  'body-sm': 'body-small',
  eyebrow: 'eyebrow',
  label: 'label',
  caption: 'caption',
  'mono-mid': 'mono-mid',
  mono: 'mono',
  'mono-sm': 'mono-small',
}

/** Hand-kept on purpose: viewport-scaled display sizes, and a lede mobile lacks. */
const LANDING_ONLY = ['h-hero', 'h1', 'h2', 'body-lg', 'mono-large']

test('the generated sheet defines every atom type.css applies', () => {
  expect(generated.size).toBeGreaterThan(0)
  expect(applied.length).toBe(Object.keys(EXACT).length)
  for (const atom of applied) expect(generated.has(atom)).toBe(true)
})

test('every class with an exact mobile twin applies it instead of restating the numbers', () => {
  for (const [cls, atom] of Object.entries(EXACT)) {
    const rule = typeSheet.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0] ?? ''
    expect(rule, cls).toContain(`@apply type-${atom}`)
    expect(rule, cls).not.toMatch(/font-size:/)
  }
})

test('only the landing-scaled atoms keep hand-written sizes', () => {
  const handWritten = [...typeSheet.matchAll(/\.([a-z0-9-]+) \{[^}]*font-size:/g)].map((m) => m[1])
  expect(handWritten.sort()).toEqual([...LANDING_ONLY].sort())
})
