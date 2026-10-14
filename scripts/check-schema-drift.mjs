#!/usr/bin/env node
/**
 * check-schema-drift.mjs
 *
 * Fails when the Drizzle schema (packages/shared/src/db/schema) and the
 * committed migrations disagree, i.e. when `drizzle-kit generate` would write
 * something. The server tests build their database from the migration SQL, not
 * from the schema expressions, so an edited CHECK/default/index with no
 * migration stays green everywhere else and only surfaces at deploy time.
 *
 * Runs `drizzle-kit generate`, compares the migrations folder before and
 * after, then restores it — the check leaves the tree as it found it.
 *
 * Usage:  node scripts/check-schema-drift.mjs
 */
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { snapshotDir, diffSnapshots, restoreSnapshot } from './lib/schema-drift.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SERVER = resolve(ROOT, 'apps/server')
const MIGRATIONS = resolve(SERVER, 'src/db/migrations')

const before = snapshotDir(MIGRATIONS)
const run = spawnSync('pnpm', ['exec', 'drizzle-kit', 'generate'], {
  cwd: SERVER,
  encoding: 'utf8',
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://unused@localhost/unused' },
})
const changed = diffSnapshots(before, snapshotDir(MIGRATIONS))
restoreSnapshot(MIGRATIONS, before)

if (run.status !== 0) {
  console.error(run.stdout, run.stderr)
  console.error('schema drift check: drizzle-kit generate failed, so the check proved nothing')
  process.exit(1)
}
if (changed.length > 0) {
  console.error('Schema drift: packages/shared/src/db/schema has changes with no migration.')
  console.error('`pnpm --filter <server> db:generate` would write:\n  ' + changed.join('\n  '))
  console.error('Run it, review the SQL, and commit the migration with the schema edit.')
  process.exit(1)
}
console.log('schema drift check: schema and migrations agree')
