/**
 * The test scripts' globs must actually reach the suites on disk (#47).
 *
 * This exists because the fast-iteration script silently under-collected for an
 * unknown length of time: `test:unit` globbed `test/unit/*.test.ts`, one level
 * only, while five suites live in `test/unit/chains/` — so 67 unit tests, the
 * chain-secrets and sweep-gate suites among them, never ran on the path a
 * developer uses between full gates. Nothing failed. A glob that misses a file
 * reports success for the files it did run, which is the whole hazard: the
 * gate's own reach is the one thing its output cannot tell you about.
 *
 * Same family as `worker-schedule.test.ts` (every queue is scheduled or
 * declared event-driven) and `env-example-parity.test.ts` (documented env keys
 * are keys the loader reads) — a composition fact that no unit test can see.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface PackageScripts {
  scripts: Record<string, string>
}

// `__dirname`, not `import.meta`: this package emits CommonJS, so import.meta
// is a type error here — the same spelling `test/helpers/anvil.ts` uses.
const pkg: PackageScripts = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8'),
) as PackageScripts

/** Every `*.test.ts` under `dir`, as paths relative to it. */
function suitesUnder(dir: string, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) found.push(...suitesUnder(join(dir, entry.name), rel))
    else if (entry.name.endsWith('.test.ts')) found.push(rel)
  }
  return found
}

const TEST_ROOT = join(__dirname, '..')
const UNIT_ROOT = join(TEST_ROOT, 'unit')

test('the unit glob is recursive, and there are nested suites that need it to be', () => {
  // Both halves matter. The literal pin alone would be a copy of the script;
  // what makes it bite is the FIRST assertion, which proves the recursion is
  // load-bearing right now rather than a precaution about a hypothetical.
  const nested = suitesUnder(UNIT_ROOT).filter((rel) => rel.includes('/'))
  assert.ok(
    nested.length > 0,
    'no nested unit suites — if they were deliberately flattened, this guard can go',
  )
  assert.match(
    pkg.scripts['test:unit'],
    /"test\/unit\/\*\*\/\*\.test\.ts"/,
    `test:unit must recurse; ${nested.length} suites live in subdirectories (${nested[0]})`,
  )
})

test('the gate glob collects every suite, at every depth, and only suites', () => {
  // One assertion, not two. A separate `doesNotMatch(/test\/\*\*\/\*\.ts/)` was
  // here and is gone: the exact pin below already excludes the wide glob, so it
  // could never fail on its own — it only ever reddened alongside this one,
  // which is a guard in name only.
  //
  // Both directions still matter. Too NARROW and suites stop running while the
  // gate reports success; too WIDE and `test/**/*.ts` pulls in 33 helper and
  // fixture modules as if they were suites, paying their compile and module
  // init for no assertion — measured at 8.2s.
  const nested = suitesUnder(TEST_ROOT).filter((rel) => rel.includes('/'))
  assert.ok(nested.length > 0, 'suites live in subdirectories of test/')
  assert.match(pkg.scripts.test, /"test\/\*\*\/\*\.test\.ts"/)
})
