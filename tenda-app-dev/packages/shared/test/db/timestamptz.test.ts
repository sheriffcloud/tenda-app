/**
 * Every stored instant carries its zone.
 *
 * A bare `timestamp` column has no zone attached, so `now()` renders wall
 * clock in whatever the DB SESSION's zone is and postgres.js then parses that
 * zoneless string with `new Date(str)` — which ECMAScript defines as local
 * time IN THE READING PROCESS. Two machines therefore disagree about when the
 * row happened, silently, and the app has no way to notice: a row written
 * while the DB sat one zone ahead of the API container lands in the FUTURE,
 * and `formatRelativeShort` reads any future instant as "now" for exactly
 * that many hours. That was a real reported symptom ("Posted now" that would
 * not age), and no amount of client-side care can fix it — by the time the
 * value reaches a browser the damage is already baked into the instant.
 *
 * `timestamptz` removes the guess: the value carries the zone, so neither the
 * database's configured zone nor the container's TZ is ever consulted. This
 * test is what keeps it that way — a single `timestamp('x')` added without
 * the flag reintroduces the whole class.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getTableColumns, is } from 'drizzle-orm'
import { PgTable, PgTimestamp } from 'drizzle-orm/pg-core'
import * as schema from '../../src/db/schema'

/** Every timestamp column in the schema, as `table.column` → its SQL type. */
function timestampColumns(): Array<{ name: string; sqlType: string }> {
  const found: Array<{ name: string; sqlType: string }> = []
  for (const [tableName, table] of Object.entries(schema)) {
    if (!is(table, PgTable)) continue
    for (const [colName, col] of Object.entries(getTableColumns(table))) {
      if (is(col, PgTimestamp)) found.push({ name: `${tableName}.${colName}`, sqlType: col.getSQLType() })
    }
  }
  return found
}

test('the schema actually has timestamp columns to check', () => {
  // Guards the guard: a broken introspection would make every assertion below
  // pass vacuously over an empty list.
  assert.ok(timestampColumns().length > 50, 'expected the schema to expose many timestamp columns')
})

test('EVERY timestamp column carries its time zone', () => {
  const naive = timestampColumns().filter((c) => !c.sqlType.includes('with time zone'))
  assert.deepEqual(
    naive.map((c) => c.name),
    [],
    'these columns would be read as local time by whichever process happens to parse them',
  )
})
