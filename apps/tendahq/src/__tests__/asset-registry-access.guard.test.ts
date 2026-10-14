/**
 * No bracket read of the shared asset registry anywhere in the landing's source.
 *
 * `ASSET_META[x]` on a plain object answers a truthy FUNCTION for a prototype
 * key ('toString', 'constructor', '__proto__'), so every `=== undefined` and
 * `?.field ?? fallback` written against it is a guard that never fires — the
 * class that printed 'NaN' for money on web (#33) and would moderate a price at
 * zero decimals (#116). Mobile and web each hold their tree to the accessor
 * with a twin of this file; the landing did not, and `chains.ts` read the
 * registry by bracket until it did.
 *
 * Landing content is built at module load from the chain manifest, so the key
 * cannot be a prototype key TODAY. That is a property of one caller, not of the
 * access, and it is exactly the kind of thing a later manifest field or a new
 * section changes without noticing. No register of exceptions: there is no
 * legitimate bracket read of this map.
 *
 * THE WALK IS DERIVED from the filesystem, not from a list of folders someone
 * keeps current — the lesson web's twin learned when a planted read in `api/`
 * passed green. It also reads the files at the root of `src` (App.tsx,
 * main.tsx, env.ts), which a directory-only walk would never see.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BRACKET_READ = /\bASSET_META\s*\[/g
const ACCESSOR = /\b(getAssetMeta|assetSymbol|registryAsset)\b/

/**
 * What is not app source, at ANY depth: the test trees (whose fixtures and
 * controls quote the very bracket read this refuses — the pattern's own
 * positive control below is one) and build output. ONE list of what to SKIP;
 * the source is read off the filesystem.
 */
const SKIPPED = new Set(['__tests__', '__fixtures__', '__mocks__', 'test-support', 'node_modules', 'coverage', 'dist'])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) out.push(...sourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('asset registry access', () => {
  const files = sourceFiles(ROOT)

  it('walks a real tree — a broken walk would pass every case below vacuously', () => {
    expect(files.length).toBeGreaterThan(50)
    const users = files.filter((file) => ACCESSOR.test(readFileSync(file, 'utf8')))
    expect(users.length).toBeGreaterThan(0)
  })

  it('walks the source folders AND the files at the root of src', () => {
    const rel = files.map((file) => relative(ROOT, file))
    for (const folder of ['content', 'components', 'lib', 'hooks', 'api']) {
      expect(rel.some((file) => file.startsWith(`${folder}/`)), `${folder}/ was not walked`).toBe(true)
    }
    expect(rel).toContain('App.tsx')
  })

  it('searches for something real — a positive and a negative control on the pattern itself', () => {
    // A typo in the pattern would make the case below pass over a tree full of
    // bracket reads, and nothing else here would notice.
    expect('const meta = ASSET_META[asset]'.match(BRACKET_READ)).toHaveLength(1)
    expect('const meta = ASSET_META [asset]'.match(BRACKET_READ)).toHaveLength(1)
    expect('const meta = getAssetMeta(asset)'.match(BRACKET_READ)).toBeNull()
  })

  it('reads ASSET_META only through its accessor — no bracket read in any source file', () => {
    const offenders = files
      .map((file) => ({
        file: relative(ROOT, file),
        hits: readFileSync(file, 'utf8').match(BRACKET_READ)?.length ?? 0,
      }))
      .filter(({ hits }) => hits > 0)
    // Reported as a list of files, so a failure names where the bracket came back.
    expect(offenders).toEqual([])
  })
})
