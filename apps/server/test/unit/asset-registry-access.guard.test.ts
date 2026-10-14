/**
 * No bracket read of the shared asset registry anywhere in the server's source.
 *
 * `ASSET_META[x]` on a plain object answers a truthy FUNCTION for a prototype
 * key ('toString', 'constructor', '__proto__'), so every `=== undefined` and
 * `?.field ?? fallback` written against it is a guard that never fires — the
 * class that moderated a price at zero decimals (#116). Mobile, web and the
 * landing each hold their tree to the accessor with a twin of this file; the
 * server computes the money amounts, and held the rule only in three comments.
 *
 * THE WALK IS DERIVED from the filesystem, not from a list of folders someone
 * keeps current. No register of exceptions: there is no legitimate bracket
 * read of this map.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..', '..', 'src')
const BRACKET_READ = /\bASSET_META\s*\[/g
const ACCESSOR = /\bgetAssetMeta\b/

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.ts$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

const files = sourceFiles(ROOT)

test('walks a real tree — a broken walk would pass the case below vacuously', () => {
  assert.ok(files.length > 200, `only ${files.length} files walked`)
  assert.ok(files.some((file) => ACCESSOR.test(readFileSync(file, 'utf8'))))
  const rel = files.map((file) => relative(ROOT, file))
  for (const folder of ['features', 'routes', 'db', 'queue']) {
    assert.ok(rel.some((file) => file.startsWith(`${folder}/`)), `${folder}/ was not walked`)
  }
})

test('the pattern finds a bracket read and ignores the accessor', () => {
  assert.equal('const meta = ASSET_META[asset]'.match(BRACKET_READ)?.length, 1)
  assert.equal('const meta = ASSET_META [asset]'.match(BRACKET_READ)?.length, 1)
  assert.equal('const meta = getAssetMeta(asset)'.match(BRACKET_READ), null)
})

test('reads ASSET_META only through its accessor — no bracket read in any source file', () => {
  const offenders = files
    .map((file) => ({ file: relative(ROOT, file), hits: readFileSync(file, 'utf8').match(BRACKET_READ)?.length ?? 0 }))
    .filter(({ hits }) => hits > 0)
  assert.deepEqual(offenders, [])
})
