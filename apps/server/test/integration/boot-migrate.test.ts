/**
 * lib/boot-migrate.ts — opt-in boot-time migrations (MIGRATE_ON_BOOT=true):
 * flag-gated (unset = never connects, proven with a dead-port URL),
 * advisory-locked (concurrent boots serialize instead of racing the journal),
 * and writes the same drizzle.__drizzle_migrations journal as drizzle-kit.
 * DB-backed cases gated on TEST_DATABASE_URL (helpers/test-app).
 */
import { test } from 'node:test'
import assert from 'node:assert'
import os from 'node:os'
import postgres from 'postgres'
import { TEST_DB_CONFIGURED } from '../helpers/test-app'
import { migrateOnBoot, resolveMigrationsFolder } from '@server/lib/boot-migrate'

const skip = !TEST_DB_CONFIGURED
const log = { info: () => {} }
// Refuses instantly (ECONNREFUSED) — proves the flag gate without a timeout.
const DEAD_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:59999/nope'

async function withFlag(fn: () => Promise<void>): Promise<void> {
  process.env.MIGRATE_ON_BOOT = 'true'
  try {
    await fn()
  } finally {
    delete process.env.MIGRATE_ON_BOOT
  }
}

test('resolveMigrationsFolder: finds the repo layout from apps/server', () => {
  assert.match(resolveMigrationsFolder(), /src[/\\]db[/\\]migrations$/)
})

test('resolveMigrationsFolder: throws when no migrations folder exists', () => {
  const cwd = process.cwd()
  process.chdir(os.tmpdir())
  try {
    assert.throws(() => resolveMigrationsFolder(), /no migrations folder/)
  } finally {
    process.chdir(cwd)
  }
})

test('flag unset: resolves without opening any connection', async () => {
  // A live connection attempt against the dead port would reject; the gate
  // must return before the URL is ever used.
  await migrateOnBoot(log, DEAD_DB_URL)
})

test('flag set: applies/no-ops against the test DB and leaves the journal', { skip }, async () => {
  await withFlag(() => migrateOnBoot(log, process.env.DATABASE_URL))

  const sql = postgres(process.env.DATABASE_URL as string, { max: 1 })
  try {
    const [row] = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`
    assert.ok(row.n > 0, 'migration journal should have entries')
  } finally {
    await sql.end()
  }
})

test('flag set: concurrent boots serialize on the advisory lock', { skip }, async () => {
  await withFlag(async () => {
    await Promise.all([
      migrateOnBoot(log, process.env.DATABASE_URL),
      migrateOnBoot(log, process.env.DATABASE_URL),
    ])
  })
})

test('flag set: unreachable database rejects (deploy fails, old replicas keep serving)', async () => {
  await withFlag(async () => {
    await assert.rejects(migrateOnBoot(log, DEAD_DB_URL))
  })
})
