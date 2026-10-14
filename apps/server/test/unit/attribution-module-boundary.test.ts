/**
 * Attribution stays REMOVABLE, and its removal recipe stays TRUE — a source
 * scan, modelled on gas-seed-module-boundary.test.ts, over the two properties
 * no behavioural test can see.
 *
 * WHY THIS EXISTS RATHER THAN A COMMENT. The barrel promises two things: that
 * one import is the whole public surface, and that deleting the directory plus
 * the call sites it lists removes the feature. Both are prose, and prose rots
 * silently — an import of `features/attribution/tag` compiles, runs and passes
 * every other test while quietly turning a one-directory delete into a hunt.
 *
 * The second test is the one that has already earned its place. The first cut
 * of #83 attached the tag at two call sites and the barrel said "both places
 * the server produces EVM calldata" — there were three, and the sweep
 * (chains/evm/sender/sweep.ts) broadcast untagged Celo transactions. A whole-file read
 * caught it; this catches the NEXT one, at the moment a fourth call site is
 * added rather than whenever someone next reads the docblock.
 *
 * Scanning `src/` only, deliberately — the same reasoning as the gas-seed
 * guard: tests legitimately address internals the barrel does not publish, and
 * forbidding that would push modules into the public surface just to be
 * testable.
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripComments, tsFilesUnder } from '../helpers/source-scan'

const SRC = join(__dirname, '../../src')
const FEATURE_DIR = join(SRC, 'features/attribution')

/**
 * Import specifiers naming the attribution feature, in either spelling — the
 * `@server/...` alias or a relative path — because the boundary is about the
 * MODULE reached, not how the author spelled the way there.
 */
function attributionImports(source: string): string[] {
  // Comments stripped FIRST: this feature's prose names its own module paths
  // constantly (the removal recipe lists them), and a scan that matched those
  // would report the documentation as the violation.
  const specifiers = [...stripComments(source).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
  return specifiers.filter((s) => s !== undefined && s.includes('features/attribution'))
}

test('nothing in src/ reaches past the attribution barrel', () => {
  const offenders: string[] = []
  for (const file of tsFilesUnder(SRC)) {
    if (file.startsWith(FEATURE_DIR)) continue // the feature's own internals
    for (const specifier of attributionImports(readFileSync(file, 'utf8'))) {
      if (!/features\/attribution$/.test(specifier)) {
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

test('the tag is applied from exactly the places the removal recipe names', () => {
  // EVERY entry here is a place a transaction can be born. Adding a file to
  // this list is the moment to ask whether that call site builds calldata that
  // reaches a chain — and if it does, whether it is tagged.
  const expected = [
    // 2a. the escrow transactions a CLIENT signs and broadcasts
    'chains/evm/index.ts',
    // 2a-ii. the ERC-20 `approve` the client sends BEFORE a plain (non-permit)
    //        create — the server builds that calldata now precisely so it can
    //        be tagged (#103). It was the one transaction in the flow the
    //        server did not build, and therefore the one that went out
    //        unattributed on every post of a token without EIP-2612.
    'chains/evm/build/builders.ts',
    // 2b. createEscrowFor, signed by the relayer (#18 agent funding)
    'chains/evm/relay/index.ts',
    // 2c. refundExpired / reclaimAbandoned, also relayer-signed (#43). THIS is
    //     the one the first cut missed.
    'chains/evm/sender/sweep.ts',
    // 3. the boot assertion that turns a malformed code into a startup failure
    'plugins/chains.ts',
    // the read-back check; not in the recipe's delete list because it lives in
    // the feature's own script, but it does import the barrel
    'scripts/verify-celo-tag.ts',
  ]
  const actual = tsFilesUnder(SRC)
    .filter((file) => !file.startsWith(FEATURE_DIR))
    .filter((file) => attributionImports(readFileSync(file, 'utf8')).length > 0)
    .map((file) => relative(SRC, file))
    .sort()

  assert.deepStrictEqual(
    actual,
    [...expected].sort(),
    'the set of files using attribution changed — update the removal recipe in ' +
      'features/attribution/index.ts to match, and check whether the new call site ' +
      'builds chain-bound calldata that now needs tagging',
  )
})
