/**
 * Contract tests for the 0G foundry profile.
 *
 * Both 0G chains (Galileo 16602, mainnet 16661) execute cancun-level EVM —
 * verified 2026-08-27 by opcode probe: MCOPY (0x5e) executes and CLZ (0x1e)
 * reverts `invalid opcode` on both public RPCs — while the repo's default
 * profile resolves to osaka under solc 0.8.35, and the two targets compile
 * to DIFFERENT bytecode. Deploys to 0G therefore go through
 * `FOUNDRY_PROFILE=0g`. If that profile is deleted, or its `evm_version`
 * drifts, nothing else fails: the deploy silently ships osaka bytecode to a
 * chain that cannot run its opcodes. These tests are the committed guard.
 *
 * Parsed with regexes rather than a TOML parser, matching
 * release-workflow.test.mjs / solana-pin.test.mjs, to avoid adding a config
 * dependency to a repo that has none. Section extraction is anchored to the
 * exact `[profile.<name>]` header syntax foundry uses, and every assertion
 * fails loudly if the file is restructured beyond what these can read.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const toml = readFileSync(resolve(ROOT, 'contracts/evm/foundry.toml'), 'utf8')
const gitignore = readFileSync(resolve(ROOT, 'contracts/evm/.gitignore'), 'utf8')

/**
 * Body of one `[section]`: from its header line to the next `[...]` HEADER
 * line or EOF. Line-walked rather than `[^[]*`-matched: a `[` can appear
 * mid-body (`libs = ["lib"]`, inline tables), and the char-class version
 * silently truncated the section there — caught by mutation proof.
 */
function section(name) {
  const lines = toml.split('\n')
  const start = lines.indexOf(`[${name}]`)
  assert.notEqual(start, -1, `foundry.toml has no [${name}] section`)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^\[/.test(line))
  return rest.slice(0, end === -1 ? rest.length : end).join('\n')
}

test('the 0g profile targets cancun', () => {
  assert.match(
    section('profile.0g'),
    /^evm_version = "cancun"$/m,
    '[profile.0g] must pin evm_version = "cancun" — 0G chains revert on ' +
      'post-cancun opcodes (CLZ), and the default profile resolves to osaka',
  )
})

test('the 0g profile writes its own out dir, and it is gitignored', () => {
  const out = section('profile.0g').match(/^out = "([^"]+)"$/m)
  assert.ok(out, '[profile.0g] must set its own `out` dir')
  const defaultOut = section('profile.default').match(/^out = "([^"]+)"$/m)
  assert.ok(defaultOut, '[profile.default] must set `out`')
  assert.notEqual(
    out[1],
    defaultOut[1],
    'the 0g profile must not share the default `out` — a 0G build would ' +
      'clobber the artifacts sync-abi.mjs and the shared-ABI drift guard read',
  )
  assert.match(
    gitignore,
    new RegExp(`^${out[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/$`, 'm'),
    `contracts/evm/.gitignore must ignore ${out[1]}/`,
  )
})

test('the default profile stays on the compiler default EVM target', () => {
  assert.doesNotMatch(
    section('profile.default'),
    /^evm_version\s*=/m,
    '[profile.default] must not pin evm_version — Base/Celo builds and the ' +
      'drift-guarded shared ABI track the pinned solc default; per-chain EVM ' +
      'targets get their own profile like [profile.0g]',
  )
})
