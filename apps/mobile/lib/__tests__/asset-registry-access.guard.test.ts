/**
 * No bracket read of the shared asset registry anywhere in this app's source.
 *
 * `ASSET_META[x]` on a plain object answers a truthy FUNCTION for a prototype
 * key ('toString', 'constructor', '__proto__'), so every `=== undefined` and
 * `?.field ?? fallback` written against it is a guard that never fires — the
 * class that printed 'NaN' for money (#33) and moderated a price at the wrong
 * decimals (#116). The registry has an accessor built on `Object.hasOwn`
 * (`getAssetMeta`) and a display helper on top of it (`assetSymbol`).
 *
 * Web has held its tree to them since #116; mobile had no such guard, which is
 * how `useModerationPreview` kept the last bracket read in either client
 * (#154). This is web's twin, deliberately the same shape: walk the source,
 * name the offenders, and keep NO register of exceptions — there is no
 * legitimate bracket read of this map.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const BRACKET_READ = /\bASSET_META\s*\[/g
const ACCESSOR = /\b(getAssetMeta|assetSymbol)\b/

/**
 * Everything that is not app source, at ANY depth — build output, native
 * projects, and the test tree, whose fixtures and controls quote the very
 * bracket read this refuses (the pattern's own positive control below is one).
 *
 * ONE list, and it is the list of what to skip. The source folders themselves
 * are DERIVED from the filesystem, because naming them is how this guard
 * silently stopped covering the app: it listed seven directories while the app
 * had ten, so `api/`, `theme/` and `shims/` were blind spots — a bracket read
 * planted in `api/request.ts` passed this file green, which is the precise
 * failure it exists to prevent. `__tests__/lint-scope.test.ts` derives its
 * list the same way, for the same reason.
 */
const SKIPPED = new Set([
  '__tests__', '__fixtures__', '__mocks__', 'test-support',
  'node_modules', 'android', 'ios', 'coverage', 'dist', 'assets',
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
    // The list this replaced named seven directories while the app had ten.
    // Naming the small ones is the point: they are the ones a hand-kept list
    // forgets, and `api/` is where a planted bracket read went unseen.
    expect(roots).toEqual(expect.arrayContaining(['app', 'components', 'lib', 'hooks', 'stores', 'wallet', 'features']))
    // The small ones by name: if either drops out of the walk, this says so
    // rather than leaving the offenders case to pass over an unread folder.
    expect(roots).toEqual(expect.arrayContaining(['api', 'theme']))
  })

  it('searches for something real — a positive and a negative control on the pattern itself', () => {
    // A typo in the pattern would make the case below pass over a tree full of
    // bracket reads, and nothing else here would notice: the accessor case
    // above stays green either way. So the pattern is held to two samples.
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
    // A list of files, not a count: a failure has to name where the bracket
    // came back.
    expect(offenders).toEqual([])
  })
})
