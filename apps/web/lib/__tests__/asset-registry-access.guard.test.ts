/**
 * No bracket read of the shared asset registry anywhere in this app's source.
 *
 * `ASSET_META[x]` on a plain object answers a truthy FUNCTION for a prototype
 * key ('toString', 'constructor', '__proto__'), so every `=== undefined` and
 * `?.field ?? fallback` written against it is a guard that never fires — the
 * class that printed 'NaN' for money (#33) and would moderate a price at zero
 * decimals (#116). The registry has an accessor built on Object.hasOwn
 * (`getAssetMeta`) and a display helper on top of it (`assetSymbol`); this
 * holds every file in the tree to them, the way type-atoms.guard.test.ts holds
 * every file to the type scale. No register of exceptions — there is no
 * legitimate bracket read of this map.
 *
 * THE ROOTS ARE DERIVED, and that is the whole of what this file learned the
 * hard way. It named six directories — app, components, lib, hooks, stores,
 * wallet — while the app ships eight, so `api/` and `scripts/` were never
 * walked. MEASURED: `ASSET_META[String(Math.random())]` planted in
 * `api/request.ts` passed this file GREEN, which is precisely the failure the
 * guard exists to prevent, and precisely the hole mobile's twin had in `api/`
 * before #154 derived its roots. A hand-kept list forgets the small folders,
 * and the small folders are where a stray read hides.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const BRACKET_READ = /\bASSET_META\s*\[/g
const ACCESSOR = /\b(getAssetMeta|assetSymbol)\b/

/**
 * Everything that is not app source, at ANY depth — build output and the test
 * trees, whose fixtures and controls quote the very bracket read this refuses
 * (the pattern's own positive control below is one). ONE list, and it is the
 * list of what to SKIP; the source folders are read off the filesystem.
 */
const SKIPPED = new Set([
  '__tests__', '__fixtures__', '__mocks__', 'test', 'test-support', 'e2e',
  'node_modules', 'coverage', 'test-results', '.next', 'dist',
])

/** Every root directory holding at least one .ts/.tsx file this app ships. */
function sourceRoots(): string[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED.has(entry.name))
    .map((entry) => entry.name)
    .filter((name) => sourceFiles(join(ROOT, name)).length > 0)
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIPPED.has(entry.name)) continue
      out.push(...sourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('asset registry access', () => {
  const roots = sourceRoots()
  const files = roots.flatMap((root) => sourceFiles(join(ROOT, root)))

  it('walks a real tree — a broken walk would pass every case below vacuously', () => {
    expect(files.length).toBeGreaterThan(100)
    const users = files.filter((file) => ACCESSOR.test(readFileSync(file, 'utf8')))
    expect(users.length).toBeGreaterThan(0)
  })

  it('walks EVERY root that holds source, not a list someone kept up to date', () => {
    expect(roots).toEqual(
      expect.arrayContaining(['app', 'components', 'lib', 'hooks', 'stores', 'wallet']),
    )
    // The two the hand-kept list forgot, named so that either dropping out of
    // the walk fails HERE rather than leaving the offenders case to pass over
    // an unread folder. `api/` is where the planted read went unseen.
    expect(roots).toEqual(expect.arrayContaining(['api', 'scripts']))
  })

  it('searches for something real — a positive and a negative control on the pattern itself', () => {
    // A typo in the pattern would make the case below pass over a tree full of
    // bracket reads, and nothing else here would notice: the accessor case
    // above stays green either way.
    expect('const meta = ASSET_META[asset]'.match(BRACKET_READ)).toHaveLength(1)
    expect('const meta = getAssetMeta(asset)'.match(BRACKET_READ)).toBeNull()
  })

  it('reads ASSET_META only through its accessor — no bracket read in any source file', () => {
    const offenders = files
      .map((file) => ({
        file: relative(ROOT, file),
        hits: readFileSync(file, 'utf8').match(BRACKET_READ)?.length ?? 0,
      }))
      .filter(({ hits }) => hits > 0)
    // Reported as a list of files, so a failure names where the bracket came
    // back rather than a bare count.
    expect(offenders).toEqual([])
  })
})
