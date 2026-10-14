/**
 * test/helpers/README.md lists every helper, and only helpers that exist.
 *
 * The README opens "Shared infrastructure for the unit + integration suites" and
 * presents a table, so a reader looking for an existing helper takes the table as
 * the list. When it was last measured (#116) it had rows for 8 of 21 entries —
 * and the cost of that is not a stale doc, it is a second copy of a helper
 * somebody could not find. This repo has paid that bill repeatedly: #40, #42,
 * #43, #77, #94 and #113 were all duplicate-helper cleanups, and c0eb3b3 deleted
 * a duplicate route GUARD written while the incumbent sat one screen away in the
 * same directory listing.
 *
 * BOTH DIRECTIONS, because both mislead. A missing row hides a helper. A row for
 * a file that has been deleted or renamed sends a reader looking for something
 * that is not there, and is the shape rot takes AFTER the first fix.
 *
 * Filesystem in, source text out — no imports, like route-autoload.test.ts. A
 * helper is documented if its name appears in the FIRST column of the table;
 * mentions in prose or in another cell do not count, so the check cannot be
 * satisfied by a passing reference somewhere else in the file.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const HELPERS = join(__dirname, '..', 'helpers')

/**
 * What the directory holds, named as the README names it: a `.ts` file by its
 * filename, a sub-directory with a trailing slash (`test-app/`).
 */
function helperEntries(): string[] {
  return readdirSync(HELPERS, { withFileTypes: true })
    .filter((e) => e.isDirectory() || (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort()
}

/**
 * The names in the table's first column.
 *
 * One cell may name more than one file — `redis.ts` / `chain.ts` share a row
 * because they are the same kind of thing — so every backticked token in the
 * cell counts, not just the first.
 */
function documentedNames(): string[] {
  const readme = readFileSync(join(HELPERS, 'README.md'), 'utf8')
  const names = new Set<string>()
  for (const line of readme.split('\n')) {
    if (!line.startsWith('| `')) continue
    const firstCell = line.slice(1).split('|')[0]
    for (const match of firstCell.matchAll(/`([^`]+)`/g)) names.add(match[1])
  }
  return [...names].sort()
}

test('every test helper has a row in the README, and every row names a real one', () => {
  const entries = helperEntries()
  const documented = documentedNames()

  // A walk that found nothing would satisfy both comparisons below by comparing
  // two empty lists, so the floors come first.
  assert.ok(entries.length >= 20, `expected the helpers directory, found ${entries.length} entries`)
  assert.ok(documented.length >= 20, `expected the README table, parsed ${documented.length} rows`)

  assert.deepStrictEqual(
    entries.filter((name) => !documented.includes(name)),
    [],
    'these helpers exist but the README table does not list them, so the next person ' +
      'to need one writes a second copy — add a row saying what it is FOR',
  )
  assert.deepStrictEqual(
    documented.filter((name) => !entries.includes(name)),
    [],
    'the README table names these and the directory does not have them — renamed, ' +
      'moved or deleted; fix the row rather than leaving a reader hunting',
  )
})
