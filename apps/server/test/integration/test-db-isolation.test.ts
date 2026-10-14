/**
 * That a suite really is on its own database (#49).
 *
 * The pool's entire value rests on one runtime fact — this process is connected
 * to a LEASED database, not the shared base one — and that fact is carried by a
 * `process.env.DATABASE_URL` written in a `before` hook, after the module graph
 * has already been imported. Late binding like that has a silent failure mode:
 * `getConfig()` memoises on first call, so anything that reads config before the
 * lease would pin every suite back onto the base database. Nothing would throw.
 * The only symptom would be suites interfering with each other again — which is
 * exactly the flakiness the pool exists to remove, and exactly the kind of thing
 * that gets blamed on "a flaky test" for months.
 *
 * So it is asserted where it is observable: ask the connection itself.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { TEST_DB_CONFIGURED, useTestApp } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED
const getApp = useTestApp()

/** The database name the base URL points at — the one no app suite may use. */
function baseDatabaseName(): string {
  return new URL(process.env.TEST_DATABASE_URL as string).pathname.replace(/^\//, '')
}

test('the app is connected to a LEASED database, not the shared base', { skip }, async () => {
  const rows = await getApp().db.execute<{ db: string }>(sql`select current_database() as db`)
  const connected = rows[0]?.db
  const base = baseDatabaseName()

  assert.ok(connected, 'the connection must answer which database it is on')
  assert.notStrictEqual(
    connected,
    base,
    `connected to the BASE database (${base}) — the lease did not reach plugins/db, so every ` +
      'suite is sharing one database again and the isolation this pool provides is gone',
  )
  assert.strictEqual(
    connected.startsWith(`${base}_`),
    true,
    `expected a slot of ${base}, got ${connected}`,
  )
})

test('the leased database is fully migrated, not merely created', { skip }, async () => {
  // Creating the database and migrating it are separate steps in the lease, and
  // a slot that exists but is empty would fail later, deep inside whichever
  // suite drew it, as a missing-relation error rather than a setup problem.
  const rows = await getApp().db.execute<{ n: number }>(
    sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
  )
  assert.ok((rows[0]?.n ?? 0) > 10, `a migrated slot has the app's tables, saw ${rows[0]?.n}`)
})
