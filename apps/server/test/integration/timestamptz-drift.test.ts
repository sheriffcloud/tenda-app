/**
 * The MIGRATED DATABASE carries the zone, not just the schema declaration.
 *
 * `packages/shared/test/db/timestamptz.test.ts` asserts every column is
 * declared `{ withTimezone: true }`. That is a statement about TypeScript, and
 * it cannot see the database: a column left `timestamp without time zone` in
 * Postgres — because a schema edit shipped without `db:generate`, or a
 * migration was hand-altered — satisfies the declaration test completely.
 *
 * Nothing else would catch it either, and that is the whole problem. A naive
 * column breaks no query and fails no other test: `select`, `insert`, every
 * comparison and every join behave. What it changes is only the INSTANT the
 * value means, because postgres.js parses a zoneless string with
 * `new Date(str)` — local time in whichever process happens to read it. So the
 * damage is a silent offset (measured at 3h with the DB session three zones
 * ahead of the reader), which is exactly the "Posted now that never ages" bug
 * `0033_sloppy_boomerang` was written to end.
 *
 * Same shape as api-routes-drift: the type system already makes one half
 * impossible, and this closes the half it cannot see.
 *
 * DB-backed, gated on TEST_DATABASE_URL. Read-only — it opens no transaction
 * and writes nothing, so it is safe beside the shared-DB suites.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { sql } from 'drizzle-orm'
import { buildTestApp, TEST_DB_CONFIGURED } from '../helpers/test-app'

const skip = !TEST_DB_CONFIGURED

test('every timestamp column in the migrated database carries its time zone', { skip }, async () => {
  const app = await buildTestApp()
  try {
    const rows = await app.db.execute<{ table_name: string; column_name: string }>(sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and data_type = 'timestamp without time zone'
      order by table_name, column_name`)
    assert.deepEqual(
      [...rows].map((r) => `${r.table_name}.${r.column_name}`),
      [],
      'naive columns are read as local time by whichever process parses them — run db:generate + db:migrate',
    )
  } finally {
    await app.close()
  }
})

test('and the migration actually converted them — the DB is not simply empty of timestamps', { skip }, async () => {
  // Guards the guard: an empty information_schema answer (wrong schema name,
  // a database with no tables) would make the assertion above pass vacuously.
  const app = await buildTestApp()
  try {
    const rows = await app.db.execute<{ n: number }>(sql`
      select count(*)::int as n from information_schema.columns
      where table_schema = 'public' and data_type = 'timestamp with time zone'`)
    assert.ok([...rows][0].n > 50, `expected many timestamptz columns, saw ${[...rows][0].n}`)
  } finally {
    await app.close()
  }
})
