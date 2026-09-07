#!/usr/bin/env node
/**
 * Stage-0 cutover §1 schema promotion (run during #34, after the DB wipe):
 *   1. delete packages/shared/src/db/schema.ts (legacy)
 *   2. rename packages/shared/src/db/schema-v2/ → schema/
 *   3. rewrite '@tenda/shared/db/schema-v2' imports → '@tenda/shared/db/schema'
 *   4. drop the planning-window '_v2' suffixes from pg enum NAMES
 *      (user_role_v2 → user_role, …) inside the schema sources
 *   5. remind about the package.json exports-map edit (manual — JSON edits
 *      by codemod are riskier than the 30s by hand)
 *
 * Default is a DRY RUN that prints every planned change. `--apply` executes.
 * Verify afterwards with: node scripts/cutover-verify.mjs --post
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APPLY = process.argv.includes('--apply')

const LEGACY_SCHEMA = resolve(ROOT, 'packages/shared/src/db/schema.ts')
const V2_DIR = resolve(ROOT, 'packages/shared/src/db/schema-v2')
const TARGET_DIR = resolve(ROOT, 'packages/shared/src/db/schema')

const ENUM_RENAMES = [
  ['user_role_v2', 'user_role'],
  ['user_status_v2', 'user_status'],
  ['dispute_winner_v2', 'dispute_winner'],
  ['proof_type_v2', 'proof_type'],
  ['escrow_tx_type_v2', 'escrow_tx_type'],
]

function grepFiles(pattern) {
  try {
    return execFileSync(
      'grep',
      ['-rlF', pattern, 'apps', 'packages', '--include=*.ts', '--include=*.tsx'],
      { cwd: ROOT, encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

const log = (msg) => console.log(`${APPLY ? '' : '[dry-run] '}${msg}`)

// 1. legacy schema delete
if (existsSync(LEGACY_SCHEMA)) {
  log(`delete ${LEGACY_SCHEMA}`)
  if (APPLY) rmSync(LEGACY_SCHEMA)
} else {
  console.log('legacy schema.ts already gone')
}

// 2. dir rename
if (existsSync(V2_DIR)) {
  log(`rename ${V2_DIR} → ${TARGET_DIR}`)
  if (APPLY) renameSync(V2_DIR, TARGET_DIR)
} else {
  console.log('schema-v2/ already renamed')
}

// 3. import rewrites
const importHits = grepFiles('@tenda/shared/db/schema-v2')
log(`rewrite schema-v2 imports in ${importHits.length} file(s)`)
for (const rel of importHits) {
  if (!APPLY) continue
  const abs = resolve(ROOT, rel)
  writeFileSync(
    abs,
    readFileSync(abs, 'utf8').replaceAll('@tenda/shared/db/schema-v2', '@tenda/shared/db/schema'),
  )
}

// 4. enum-name suffix drops (pgEnum first args + any references)
for (const [from, to] of ENUM_RENAMES) {
  const hits = grepFiles(`'${from}'`)
  if (hits.length > 0) log(`enum ${from} → ${to} in ${hits.length} file(s)`)
  if (!APPLY) continue
  for (const rel of hits) {
    const abs = resolve(ROOT, rel)
    writeFileSync(abs, readFileSync(abs, 'utf8').replaceAll(`'${from}'`, `'${to}'`))
  }
}

console.log(
  `\nManual follow-ups (cutover §1): update @tenda/shared package.json exports ` +
    `('./db/schema-v2*' → './db/schema*'), run pnpm --filter @tenda/shared build, ` +
    `pnpm db:generate, then node scripts/cutover-verify.mjs --post`,
)
if (!APPLY) console.log('\nRe-run with --apply to execute.')
