#!/usr/bin/env node
/**
 * sync-abi.mjs
 *
 * Propagate the compiled TendaEscrow ABI from the in-repo EVM contract
 * (`contracts/evm`) into @tenda/shared, then (by default) rebuild the package
 * so dist/ picks up the new ABI.
 *
 * The contract is the single source of truth; this copies its build output to
 * the only place the apps import it. Drift is enforced in CI: rebuild the
 * contract, run this with --no-build, and `git diff` must be empty.
 *
 * Usage:
 *   pnpm --filter @tenda/contracts-evm sync          # copy + rebuild @tenda/shared
 *   node scripts/sync-abi.mjs --no-build             # copy only (CI drift-guard / hook)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSharedAbi } from './lib/abi.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ARTIFACT = resolve(ROOT, 'contracts/evm/out/TendaEscrow.sol/TendaEscrow.json')
const DEST = resolve(ROOT, 'packages/shared/src/abi/tenda_escrow_evm.json')
const skipBuild = process.argv.includes('--no-build')

if (!existsSync(ARTIFACT)) {
  console.error(`✗ forge artifact missing: ${ARTIFACT}\n  Run \`forge build\` in contracts/evm first.`)
  process.exit(1)
}

// Contract name derived from the artifact filename — never hardcoded, so a
// contract rename can't silently drift the shared ABI's contractName.
const contractName = basename(ARTIFACT, '.json')
const contents = buildSharedAbi(readFileSync(ARTIFACT, 'utf8'), contractName)
writeFileSync(DEST, contents)
console.log(`✓ ABI synced (${JSON.parse(contents).abi.length} entries) → ${DEST}`)

if (skipBuild) {
  console.log('↷ --no-build: skipped @tenda/shared rebuild')
} else {
  execSync('pnpm --filter @tenda/shared build', { cwd: ROOT, stdio: 'inherit' })
  console.log('✓ @tenda/shared rebuilt with new ABI')
}
