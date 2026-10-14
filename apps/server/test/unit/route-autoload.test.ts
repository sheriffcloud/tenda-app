/**
 * No route file is silently unreachable.
 *
 * @fastify/autoload loads src/routes with no maxDepth. When a directory
 * contains an index file, autoload loads ONLY that index — sibling FILES are
 * skipped, subdirectories are still traversed. routes/v1/admin/index.ts
 * documents this at its head and registers all sixteen of its siblings by hand
 * for exactly that reason.
 *
 * The failure mode is silence. Drop a new `foo.ts` route beside an index.ts,
 * forget the one-line registration, and nothing complains: it compiles, it
 * lints, its unit tests pass, and the endpoint 404s in production. Nothing
 * asserts a route EXISTS unless someone wrote a test that calls it.
 *
 * #48 made this matter in a second place: routes/v1/gigs/ used to hold only
 * index.ts plus subdirectories, and now holds list-filters.ts too. That file is
 * a helper and is imported, which is precisely the property worth pinning —
 * "sits beside an index" and "is wired in" have to keep coinciding.
 *
 * Reachability is TRANSITIVE, not a direct-import check: a helper legitimately
 * reached through another helper is wired in, and failing it would be a false
 * alarm that trains people to delete the guard.
 *
 * THE OTHER DIRECTION lives in test/integration/api-routes-drift.test.ts (#115):
 * this file says every module beside an index is REGISTERED; that one says every
 * module is registered at the URL it claims — including the webhooks, ops and
 * admin paths no client contract describes. Two guards, one subject, and they
 * are named here because the repo already has evidence that someone writes a
 * second guard on this subject without finding the first.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripComments } from '../helpers/source-scan'

const ROUTES_ROOT = join(__dirname, '..', '..', 'src', 'routes')

/**
 * The `./x` and `./x/y` specifiers a module imports or re-exports.
 *
 * Comments are stripped first: a commented-out import would otherwise count as
 * wiring, which is the one direction this guard must never be wrong in — it
 * would report a genuinely orphaned route as reachable.
 */
function localSpecifiers(source: string): string[] {
  return [...stripComments(source).matchAll(/(?:from|import)\s*['"](\.\/[^'"]+)['"]/g)].map(
    (m) => m[1],
  )
}

/**
 * Every sibling file transitively reachable from `dir/index.ts`, as bare
 * stems. Only walks within `dir` — a specifier pointing at a subdirectory is
 * autoload's business, not this guard's.
 */
function reachableFrom(dir: string, files: Set<string>): Set<string> {
  const seen = new Set<string>()
  const queue = ['index']
  while (queue.length > 0) {
    const stem = queue.shift() as string
    if (seen.has(stem)) continue
    seen.add(stem)
    let source: string
    try {
      source = readFileSync(join(dir, `${stem}.ts`), 'utf8')
    } catch {
      continue // a directory specifier, or a file outside this dir
    }
    for (const spec of localSpecifiers(source)) {
      const next = spec.slice(2)
      if (files.has(next)) queue.push(next)
    }
  }
  return seen
}

/** Directories under src/routes that contain an index.ts. */
function indexedDirs(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const here = entries.some((e) => e.isFile() && e.name === 'index.ts') ? [dir] : []
  return entries
    .filter((e) => e.isDirectory())
    .reduce<string[]>((acc, e) => [...acc, ...indexedDirs(join(dir, e.name))], here)
}

test('every file beside a routes index.ts is reachable from it', () => {
  const dirs = indexedDirs(ROUTES_ROOT)
  const orphans: string[] = []
  let siblings = 0

  for (const dir of dirs) {
    const files = new Set(
      readdirSync(dir, { withFileTypes: true })
        // `.d.ts` is excluded rather than tolerated: it would arrive as a stem
        // called `foo.d` and demand an import specifier nobody would write.
        // None exists under src/routes today; this keeps a future one from
        // being reported as an orphan, which is the false alarm the header
        // above says trains people to delete the guard.
        .filter(
          (e) =>
            e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && e.name !== 'index.ts',
        )
        .map((e) => e.name.slice(0, -3)),
    )
    if (files.size === 0) continue
    siblings += files.size
    const reachable = reachableFrom(dir, files)
    for (const stem of files) {
      if (!reachable.has(stem)) orphans.push(relative(ROUTES_ROOT, join(dir, `${stem}.ts`)))
    }
  }

  // A scan over nothing passes — the floor is what says the walk still sees the
  // tree rather than going quiet after a directory move.
  assert.ok(dirs.length > 10, `expected the routes tree, walked ${dirs.length} indexed dirs`)
  assert.ok(siblings >= 15, `expected the known sibling files, found ${siblings}`)

  assert.deepStrictEqual(
    orphans.sort(),
    [],
    `these sit beside a routes index.ts but nothing imports them, and autoload ` +
      `SKIPS sibling files when an index is present — so if any is a route it is ` +
      `unreachable, and if it is a helper it is dead:\n  ${orphans.join('\n  ')}\n` +
      `Register it in that directory's index.ts, or delete it.`,
  )
})
