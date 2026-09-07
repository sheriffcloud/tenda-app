#!/usr/bin/env node
/**
 * sync-idl.mjs
 *
 * Propagate the compiled Anchor IDL + TypeScript types from the in-repo
 * Solana contract (`contracts/solana`) into @tenda/shared, then (by default)
 * rebuild the package so dist/ picks up the new IDL.
 *
 * The contract is the single source of truth; this copies its build output to
 * the only place the apps import it. Drift is enforced in CI: rebuild the
 * contract, run this with --no-build, and `git diff` must be empty.
 *
 * Usage:
 *   pnpm sync:idl            # copy + rebuild @tenda/shared
 *   node scripts/sync-idl.mjs --no-build   # copy only (CI drift-guard / hook)
 */

import { copyFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT    = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ANCHOR  = resolve(ROOT, 'contracts/solana')
const DEST    = resolve(ROOT, 'packages/shared/src/idl')
const skipBuild = process.argv.includes('--no-build')

const SRC_JSON = resolve(ANCHOR, 'target/idl/tenda_escrow.json')
const SRC_TS   = resolve(ANCHOR, 'target/types/tenda_escrow.ts')
const DST_JSON = resolve(DEST, 'tenda_escrow.json')
const DST_TS   = resolve(DEST, 'tenda_escrow.ts')

if (!existsSync(SRC_JSON) || !existsSync(SRC_TS)) {
  console.error('Anchor build output not found. Run `anchor build` in contracts/solana first.')
  console.error(`  Expected: ${SRC_JSON}`)
  console.error(`  Expected: ${SRC_TS}`)
  process.exit(1)
}

copyFileSync(SRC_JSON, DST_JSON)
console.log(`✓ Copied tenda_escrow.json → packages/shared/src/idl/`)

copyFileSync(SRC_TS, DST_TS)
console.log(`✓ Copied tenda_escrow.ts  → packages/shared/src/idl/`)

if (skipBuild) {
  console.log('↷ --no-build: skipped @tenda/shared rebuild')
} else {
  execSync('pnpm --filter @tenda/shared build', { stdio: 'inherit', cwd: ROOT })
  console.log('✓ @tenda/shared rebuilt with new IDL')
}
