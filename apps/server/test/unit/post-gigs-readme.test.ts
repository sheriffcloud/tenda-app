/**
 * The runbook beside the seeder must describe the seeder that exists (#158).
 *
 * A runbook for a script that funds escrows is only useful if an operator can
 * follow it literally, and the way this kind of document rots is silent: a flag
 * is renamed, the README keeps naming the old one, and the first person to
 * discover it is running against a live deployment with a key exported. So the
 * flag set is asserted in BOTH directions — every real flag is documented, and
 * every flag the README names is real — and the two facts an operator can get
 * wrong with money (where the key comes from, where receipts land) are pinned
 * to the constants that decide them.
 */
import { test } from 'node:test'
import * as assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGENT_KEY_ENV, BOOLEAN_FLAGS, USAGE, VALUE_FLAGS } from '@server/scripts/post-gigs/args'
import { RECEIPT_DIR } from '@server/scripts/post-gigs/receipts'

const README = readFileSync(join(__dirname, '../../src/scripts/post-gigs/README.md'), 'utf8')

/** pnpm's own flags appear in every command line here and are not the script's. */
const PNPM_FLAGS = ['--filter']

test('the runbook documents every flag the parser accepts', () => {
  const undocumented = [...VALUE_FLAGS, ...BOOLEAN_FLAGS].filter((flag) => !README.includes(flag))
  assert.deepStrictEqual(undocumented, [], 'flags missing from README.md')
})

test('the runbook names no flag the parser would refuse', () => {
  const known = new Set<string>([...VALUE_FLAGS, ...BOOLEAN_FLAGS, ...PNPM_FLAGS])
  // `_` is inside the pattern deliberately: an underscore misspelling is the
  // exact mistake that made an old `--dry_run` a live run, so a runbook must
  // not be able to print one either.
  const named = new Set(README.match(/--[a-z][a-z_-]*/g) ?? [])
  const invented = [...named].filter((flag) => !known.has(flag))
  // An invented flag is worse than a missing one: the parser REFUSES unknown
  // arguments, so following the runbook would fail outright.
  assert.deepStrictEqual(invented, [], 'README.md names flags the parser does not accept')
})

test('it finds flags at all — a README that mentioned none would pass both cases above', () => {
  const named = README.match(/--[a-z][a-z_-]*/g) ?? []
  assert.ok(named.length >= VALUE_FLAGS.length, `only ${named.length} flag mentions found`)
})

test('the two facts that cost money are pinned to the constants that decide them', () => {
  // The key comes from the SHELL — the script loads no dotenv — and receipts
  // land under the server package, committed. Both are stated in the runbook
  // with the same spelling the code uses.
  assert.ok(README.includes(AGENT_KEY_ENV), 'README.md never names the key variable')
  assert.match(README, /loads no dotenv/i)
  assert.ok(README.includes(RECEIPT_DIR), `README.md never names ${RECEIPT_DIR}`)
})

test('the usage string it defers to still exists and covers both modes', () => {
  // The runbook tells the operator to run the script with no arguments to get
  // the authoritative list; that only helps while USAGE says both halves.
  assert.match(USAGE, /--write-book/)
  assert.match(USAGE, /--api/)
  assert.ok(USAGE.includes(AGENT_KEY_ENV))
})
