/**
 * The server's import layering, pinned (folder reorganisation, 2026-10).
 *
 * The rule the folders express: `lib/` and `chains/` sit BELOW `features/`, and
 * nothing but the route tree itself reaches into `routes/`. A domain module
 * dropped into `lib/` that reaches up into `features/` turns the layer back into
 * a cluster — and nothing fails when it happens, because every file still
 * compiles. This reads the source tree and fails instead.
 *
 * Imports are resolved the way the build resolves them: the `@server/*` alias
 * and relative specifiers, with `index.ts` for a directory. Type-only imports
 * count, since a type edge couples the layers just as a value edge does.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const SRC = join(__dirname, '..', '..', 'src')

function sourcesUnder(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...sourcesUnder(full))
    else if (entry.name.endsWith('.ts')) found.push(full)
  }
  return found
}

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g

/** The source file a specifier points at, or null for a package / unresolvable one. */
function resolveSpecifier(from: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@server/')) base = join(SRC, specifier.slice('@server/'.length))
  else if (specifier.startsWith('.')) base = resolve(dirname(from), specifier)
  else return null
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

interface Edge {
  from: string
  to: string
}

/** Every resolved src→src import, as src-relative POSIX paths. */
function importEdges(): Edge[] {
  const edges: Edge[] = []
  for (const file of sourcesUnder(SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(SPECIFIER)) {
      const target = resolveSpecifier(file, match[2])
      if (target !== null) {
        edges.push({
          from: relative(SRC, file).split('\\').join('/'),
          to: relative(SRC, target).split('\\').join('/'),
        })
      }
    }
  }
  return edges
}

const EDGES = importEdges()
const top = (path: string): string => path.split('/')[0]

function offenders(predicate: (edge: Edge) => boolean): string[] {
  return EDGES.filter(predicate).map((e) => `${e.from} -> ${e.to}`)
}

test('the import scan sees the tree (a scan that finds nothing proves nothing)', () => {
  assert.ok(EDGES.length > 1000, `only ${EDGES.length} edges resolved — the resolver is broken`)
  assert.ok(
    EDGES.some((e) => top(e.from) === 'routes' && top(e.to) === 'features'),
    'no routes -> features edge found',
  )
})

test('lib/ never imports features/ or routes/', () => {
  assert.deepEqual(
    offenders((e) => top(e.from) === 'lib' && (top(e.to) === 'features' || top(e.to) === 'routes')),
    [],
    'lib/ is the domain-free layer — move the domain code into features/<domain>/, or move what it needs down into lib/',
  )
})

/**
 * `chains/` is below `features/`. Four files reach `features/attribution` (the
 * builder-code seam the EVM adapters append to calldata); that is the whole
 * exception. A fifth importer is a new upward edge: fail it, then decide.
 */
const CHAINS_MAY_IMPORT_ATTRIBUTION = [
  'chains/evm/build/builders.ts',
  'chains/evm/index.ts',
  'chains/evm/relay/index.ts',
  'chains/evm/sender/sweep.ts',
]

test('chains/ imports features/ only through the attribution seam, from the four known files', () => {
  const upward = EDGES.filter((e) => top(e.from) === 'chains' && top(e.to) === 'features')
  assert.deepEqual(
    upward.filter((e) => !e.to.startsWith('features/attribution/')).map((e) => `${e.from} -> ${e.to}`),
    [],
    'chains/ must not depend on a feature other than attribution',
  )
  assert.deepEqual(
    [...new Set(upward.map((e) => e.from))].sort(),
    CHAINS_MAY_IMPORT_ATTRIBUTION,
    'the set of chains/ files importing features/attribution changed',
  )
})

test('nothing outside routes/ imports routes/', () => {
  assert.deepEqual(
    offenders((e) => top(e.to) === 'routes' && top(e.from) !== 'routes'),
    [],
    'routes/ is autoloaded — shared logic belongs in features/ or lib/, not behind a route file',
  )
})

/**
 * A folder holds files OR folders, never both (folder reorganisation, phase 2).
 * `lib/filename.ts` beside `lib/escrow/` is the case that rule exists for: the
 * loose files are the ones nobody can place.
 *
 * Exempt: `index.ts` barrels; `app.ts` / `server.ts` (process entry points that
 * `package.json`, the Dockerfile and `instrument.js` address by path); and the
 * three trees whose shape something else decides — `routes/` (the URL),
 * `plugins/` (autoload reads it flat), `scripts/` (each file is a CLI entry
 * point named by a package.json script). Flat folders with NO subfolders are
 * fine: the rule is against mixing, not against files.
 */
const MIXED_FOLDER_EXEMPT_TOP = new Set(['routes', 'plugins', 'scripts'])
const ENTRY_POINTS = new Set(['app.ts', 'server.ts'])

function holdsSource(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some((entry) =>
    entry.isDirectory() ? holdsSource(join(dir, entry.name)) : entry.name.endsWith('.ts'),
  )
}

function mixedFolders(dir = SRC, rel = ''): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const loose = entries.filter(
    (e) =>
      e.isFile() &&
      e.name.endsWith('.ts') &&
      e.name !== 'index.ts' &&
      !e.name.endsWith('.d.ts') &&
      !(rel === '' && ENTRY_POINTS.has(e.name)),
  )
  const subs = entries.filter((e) => e.isDirectory() && holdsSource(join(dir, e.name)))
  const found = loose.length > 0 && subs.length > 0 ? [rel === '' ? '.' : rel] : []
  for (const sub of subs) {
    if (rel === '' && MIXED_FOLDER_EXEMPT_TOP.has(sub.name)) continue
    found.push(...mixedFolders(join(dir, sub.name), rel === '' ? sub.name : `${rel}/${sub.name}`))
  }
  return found
}

test('no folder mixes loose files with subfolders', () => {
  assert.deepEqual(
    mixedFolders(),
    [],
    'a folder holds files or folders, not both — put the loose files in a subfolder named for what they do',
  )
})
