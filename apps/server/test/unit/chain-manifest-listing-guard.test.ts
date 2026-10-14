/**
 * THE rule that keeps the chain pause from decaying: nothing that LISTS the
 * manifest for users does so without asking `isChainEnabled`.
 *
 * A source scan, because the failure compiles, runs and passes every
 * behavioural test: someone adds a list of chains (a picker, a landing row, a
 * capability set) over `CHAIN_MANIFEST`, a paused chain shows up in it, and
 * nothing is red. This is the same shape as rpc-central-seam.test.ts for the
 * same reason, and it is the "guard" the pause card asks for ("without it the
 * flag decays the first time someone adds a list").
 *
 * The rule: a non-test source file whose CODE (comments blanked) reads
 * `CHAIN_MANIFEST` or `evmManifestEntries` must either mention
 * `isChainEnabled` / `enabledChains`, or be listed in `NEEDS_EVERY_CHAIN`
 * below with the reason it must see paused chains too. The list is exact in
 * both directions: an entry whose file no longer reads the manifest, or now
 * does use the helper, fails — an exemption cannot outlive its reason.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripComments } from '../helpers/source-scan'

const ROOT = join(__dirname, '../../../..')

/** Files that must see EVERY chain, paused or not, and why. */
const NEEDS_EVERY_CHAIN: Readonly<Record<string, string>> = {
  'packages/shared/src/chains/manifest.ts': 'the data itself and its import-time validator',
  'packages/shared/src/chains/appkit-network.ts': 'wallet networks: a signer on a paused chain still has exits to sign',
  'apps/web/wallet/reown/networks.ts': 'wallet networks: a signer on a paused chain still has exits to sign',
  'apps/admin/providers/reown/networks.ts': 'wallet networks: a dispute admin may resolve on a paused chain',
  'apps/server/src/chains/index.ts': 'the paymaster set stays: existing escrows on a paused chain still settle',
  'apps/server/src/chains/secrets/index.ts': 'configuration must know every chain, or a paused chain with a live escrow would not boot',
  'apps/server/src/chains/secrets/schema.ts': 'configuration must know every chain, or a paused chain with a live escrow would not boot',
  'apps/server/src/lib/chain/sponsor.ts': 'the sponsorship set stays: existing escrows on a paused chain still settle',
  'apps/tendahq/src/content/chain-status.ts': 'an id-to-status lookup for chains the landing already filtered through enabledChains',
}

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.next', 'coverage', '.expo', '.turbo', 'build', 'generated', 'android', 'ios',
  '__tests__', 'test', 'tests', 'e2e', 'test-support', 'tests-devnet',
])

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourcesUnder(full)
    const isSource = /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec|d)\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')
    return isSource ? [full] : []
  })
}

// Not when the name is only the end of a quoted message (`... in CHAIN_MANIFEST`).
const READS_MANIFEST = /\bCHAIN_MANIFEST\b(?![`'"])|\bevmManifestEntries\b/
const ASKS_HELPER = /\bisChainEnabled\b|\benabledChains\b/

/**
 * Whether the helper is USED, not merely imported: an `import { enabledChains }` left behind
 * after a list went back to reading the manifest directly would otherwise satisfy the rule.
 * Import statements (single- or multi-line) are blanked before looking.
 */
const IMPORT_STATEMENT = /^import\b[\s\S]*?\bfrom\s+['"][^'"]+['"]\s*;?[ \t]*$/gm
const asksHelper = (code: string): boolean => ASKS_HELPER.test(code.replace(IMPORT_STATEMENT, ''))

function scanned(): Array<{ rel: string; code: string }> {
  const dirs = (parent: string) => readdirSync(join(ROOT, parent), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  const roots = [
    ...dirs('apps').map((name) => join(ROOT, 'apps', name)),
    ...dirs('packages').map((name) => join(ROOT, 'packages', name, 'src')),
  ].filter((dir) => existsSync(dir))
  return roots
    .flatMap(sourcesUnder)
    .map((file) => ({ rel: relative(ROOT, file).replace(/\\/g, '/'), code: stripComments(readFileSync(file, 'utf8')) }))
}

test('the scan actually walks the tree (a scanner that finds nothing would pass anything)', () => {
  const files = scanned()
  assert.ok(files.length > 500, `only ${files.length} files scanned`)
  assert.ok(files.some(({ rel }) => rel === 'packages/shared/src/chains/pause.ts'))
  assert.ok(files.some(({ rel }) => rel === 'apps/tendahq/src/content/chains.ts'))
  assert.ok(!files.some(({ rel }) => rel.includes('node_modules') || rel.includes('/__tests__/')))
})

test('every file that lists the manifest asks isChainEnabled, or is listed with its reason', () => {
  const offenders = scanned()
    .filter(({ code }) => READS_MANIFEST.test(code) && !asksHelper(code))
    .map(({ rel }) => rel)
    .filter((rel) => !Object.hasOwn(NEEDS_EVERY_CHAIN, rel))
  assert.deepStrictEqual(
    offenders,
    [],
    'These read the chain manifest without isChainEnabled, so a paused chain would appear in them. ' +
      'Filter through enabledChains()/isChainEnabled, or, if they genuinely must see every chain, add them to NEEDS_EVERY_CHAIN with the reason.',
  )
})

test('the exemption list is exact: no entry for a file that is gone, no longer reads the manifest, or now asks the helper', () => {
  const byRel = new Map(scanned().map(({ rel, code }) => [rel, code]))
  for (const rel of Object.keys(NEEDS_EVERY_CHAIN)) {
    const code = byRel.get(rel)
    assert.ok(code !== undefined, `${rel} is listed but was not scanned (moved or deleted?)`)
    assert.ok(READS_MANIFEST.test(code), `${rel} is listed but no longer reads the manifest`)
    assert.ok(!asksHelper(code), `${rel} is listed but now asks the helper: drop the exemption`)
  }
})

test('the surfaces that DO list chains for users go through the helper', () => {
  const byRel = new Map(scanned().map(({ rel, code }) => [rel, code]))
  for (const rel of [
    'apps/tendahq/src/content/chains.ts',
    'packages/shared/src/content/support/chains.ts',
    'apps/server/src/features/fiat-rails/core/capabilities.ts',
    'packages/shared/src/chains/manifest-queries.ts',
  ]) {
    assert.ok(asksHelper(byRel.get(rel) ?? ''), `${rel} must filter through isChainEnabled/enabledChains (an import alone does not count)`)
  }
})

test('the helper check discriminates: an import alone is not a use, a call is', () => {
  const importOnly = "import { CHAIN_MANIFEST, enabledChains } from '@tenda/shared'\nexport const ALL = [...CHAIN_MANIFEST]\n"
  const multiLineImportOnly = "import {\n  CHAIN_MANIFEST,\n  isChainEnabled,\n} from '@tenda/shared'\nexport const ALL = [...CHAIN_MANIFEST]\n"
  const used = "import { enabledChains } from '@tenda/shared'\nexport const ALL = enabledChains()\n"
  assert.equal(asksHelper(importOnly), false)
  assert.equal(asksHelper(multiLineImportOnly), false)
  assert.equal(asksHelper(used), true)
})
