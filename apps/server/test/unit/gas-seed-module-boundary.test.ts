/**
 * The gas seed stays REMOVABLE — a source scan, modelled on
 * alerts-registry.test.ts, over the property no behavioural test can see.
 *
 * The removal recipe in `features/gas-seed/index.ts` promises that deleting the
 * directory, one route folder and three registry lines removes the feature.
 * That promise is only true while nothing in `src/` reaches PAST the barrel: an
 * import of `features/gas-seed/claim/service` compiles, runs, passes every
 * other test, and quietly turns a one-directory delete into a hunt. Nothing
 * else would ever notice.
 *
 * Scanning `src/` only, deliberately. Tests legitimately address internals the
 * barrel does not publish (the sender constructors, the EVM port), and a rule
 * that forbade that would push those modules into the public surface just to be
 * testable — which is the opposite of what this guards.
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripComments, tsFilesUnder } from '../helpers/source-scan'

const SRC = join(__dirname, '../../src')
const FEATURE_DIR = join(SRC, 'features/gas-seed')

/**
 * Import specifiers naming the gas-seed feature.
 *
 * Matches both spellings a file can use — the `@server/...` alias and a
 * relative path — because the boundary is about the MODULE reached, not about
 * how the author spelled the way there.
 */
function gasSeedImports(source: string): string[] {
  // Comments stripped FIRST: this feature's own prose names its module paths
  // constantly (the removal recipe lists them), and a scan that matched those
  // would report the documentation as the violation.
  const specifiers = [...stripComments(source).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
  return specifiers.filter((s) => s !== undefined && s.includes('features/gas-seed'))
}

test('nothing in src/ reaches past the gas-seed barrel', () => {
  const offenders: string[] = []
  for (const file of tsFilesUnder(SRC)) {
    if (file.startsWith(FEATURE_DIR)) continue // the feature's own internals
    for (const specifier of gasSeedImports(readFileSync(file, 'utf8'))) {
      // The barrel, and only the barrel: '@server/features/gas-seed' exactly.
      // Anything with a further segment is a reach past it.
      if (!/features\/gas-seed$/.test(specifier)) {
        offenders.push(`${relative(SRC, file)} imports '${specifier}'`)
      }
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `these imports break the removal recipe — import the barrel instead:\n  ${offenders.join('\n  ')}`,
  )
})

test('the feature is reached from exactly the places the removal recipe names', () => {
  // The recipe is only useful if it is COMPLETE. This lists the importers so a
  // new one has to be added here deliberately — and, at that moment, to the
  // recipe as well.
  const expected = [
    // 2. the autoloaded route folder
    'routes/v1/wallet/gas-seed/index.ts',
    // 3. the two registry lines that survive as imports (the third,
    //    WORKER_CONCURRENCY, is a bare map entry with no import)
    'plugins/queue/payloads.ts',
    'queue/workers/processors/index.ts',
    // 4. the seeder's funder derivation
    'db/seed/rows.ts',
    // 5. the hot-wallet monitor's balance reader (#53b). ONE file, and that is
    //    the point: features/alerts owns the seed's low-balance alert, so the
    //    dependency runs one way and this is the whole of the seam. The audit
    //    script USED to be on this list; it now reads the funder from the
    //    chains row instead of deriving it from the secret, so it no longer
    //    touches the feature at all.
    'features/alerts/kinds/gas-seed-balance-reader.ts',
  ]
  const actual = tsFilesUnder(SRC)
    .filter((file) => !file.startsWith(FEATURE_DIR))
    .filter((file) => gasSeedImports(readFileSync(file, 'utf8')).length > 0)
    .map((file) => relative(SRC, file))
    .sort()

  assert.deepStrictEqual(
    actual,
    [...expected].sort(),
    'the set of files importing the gas seed changed — update the removal recipe in features/gas-seed/index.ts to match',
  )
})

test('the WORKER_CONCURRENCY entry the recipe calls mandatory really is', () => {
  // The recipe says removing the feature must delete this line, and warns it is
  // not optional. That warning is only true while the map is exhaustive over
  // JobName — if it ever became Partial, a reader would follow the recipe,
  // delete the entry, and ship a worker running at BullMQ's default
  // concurrency, which for a nonce-serial hot wallet is a real failure.
  const source = readFileSync(join(SRC, 'plugins/workers.ts'), 'utf8')
  assert.match(
    source,
    /WORKER_CONCURRENCY:\s*Record<JobName,\s*number>/,
    'WORKER_CONCURRENCY is no longer exhaustive over JobName',
  )
  assert.match(source, /'gas-seed':\s*1/, 'gas-seed sends must stay serialised (one nonce)')
})
