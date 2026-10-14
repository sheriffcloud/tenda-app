/**
 * No source file may import the `@tenda/shared` BARREL.
 *
 * The barrel re-exports `db/schema`, which pulls drizzle-orm. One such import
 * in `lib/run.ts` — for a single route constant — put 207 shared modules and
 * 80 drizzle modules into the browser bundle and took it from 318 kB to
 * 804 kB. Nothing failed: the page worked, it was just carrying a database
 * layer.
 *
 * The aliased subpaths (vite.config.ts, and the same map in vitest.config.ts
 * and both tsconfigs) point at single SOURCE files, so an import through one
 * of them costs what it says. This holds every file to them, the way the
 * landing is held to the same rule.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
/**
 * NOT global. `RegExp.prototype.test` on a `/g` regex advances `lastIndex`, so
 * reusing one object across files makes the second call start mid-file — this
 * guard would have stopped counting offenders at the first one it found.
 */
const BARREL = /from\s+'@tenda\/shared'/
const SUBPATH = /from\s+'@tenda\/shared\/[a-z-]+'/

/**
 * This file, which the walk must skip: its regex controls below contain the
 * very import they refuse, so a guard that read itself would report itself.
 * Named rather than pattern-excluded — one exemption, stated.
 */
const SELF = 'shared-imports.guard.test.ts'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return ['generated', 'test-support'].includes(entry.name) ? [] : sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && entry.name !== SELF ? [full] : []
  })
}

describe('shared imports', () => {
  const files = sourceFiles(SRC)

  it('matches a barrel import and only a barrel import', () => {
    const barrel = "import { x } from '@tenda/shared'"
    expect(BARREL.test(barrel), 'a barrel import must be caught').toBe(true)
    expect(BARREL.test("import { x } from '@tenda/shared/app-info'"), 'a subpath is the allowed form').toBe(false)
  })

  it('gives the same answer twice — the walk asks it once per file', () => {
    // A `/g` regex advances `lastIndex` on every match, so the SECOND file to
    // offend would be tested from past its own import and reported clean. Two
    // consecutive positives is the only shape that catches that; interleaving
    // a negative hides it, because a failed test resets `lastIndex` to 0.
    const barrel = "import { x } from '@tenda/shared'"
    expect(BARREL.test(barrel)).toBe(true)
    expect(BARREL.test(barrel), 'the pattern is stateful — it will skip offenders').toBe(true)
  })

  it('walks a real tree — an empty walk would pass this vacuously', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((file) => SUBPATH.test(readFileSync(file, 'utf8')))).toBe(true)
  })

  it('reaches @tenda/shared only through an aliased subpath', () => {
    const offenders = files
      .filter((file) => BARREL.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
    expect(offenders, 'the barrel drags db/schema and drizzle-orm into the bundle').toEqual([])
  })
})

describe('the content layer', () => {
  it('carries no label the page never renders', async () => {
    // Dead copy is how a content file starts describing a page that no longer
    // exists. Every key must be reachable from a component.
    const { DOCS_COPY } = await import('@/content')
    const source = sourceFiles(SRC)
      .filter((file) => !file.includes('__tests__') && !file.endsWith('content/index.ts'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    const unused = Object.keys(DOCS_COPY).filter((key) => !source.includes(`DOCS_COPY.${key}`))
    expect(unused).toEqual([])
  })
})
