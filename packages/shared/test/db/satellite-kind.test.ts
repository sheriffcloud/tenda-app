/**
 * The satellites' kind pin, as DECLARED: `gig_details` and `exchange_details`
 * carry a constant `kind`, a CHECK that pins it, and a composite foreign key onto
 * `escrows (id, kind)`; `escrows` declares the unique pair the key points at.
 * What the database DOES with them is proved against a real one in the server's
 * integration suite (satellite-kind.test.ts). This holds the declaration: a
 * rename or a deletion here would otherwise surface only as a missing migration.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import { escrows } from '../../src/db/schema/escrow/escrows'
import { exchange_details } from '../../src/db/schema/escrow/exchange'
import { gig_details } from '../../src/db/schema/escrow/gig'

const sqlOf = (value: Parameters<PgDialect['sqlToQuery']>[0]): string => new PgDialect().sqlToQuery(value).sql

for (const [table, kind, fkName, chkName] of [
  [gig_details, 'gig', 'gig_details_escrow_kind_fk', 'gig_details_kind_chk'],
  [exchange_details, 'exchange', 'exchange_details_escrow_kind_fk', 'exchange_details_kind_chk'],
] as const) {
  const config = getTableConfig(table)

  test(`${config.name}: a NOT NULL kind defaulting to '${kind}', so no writer sets it`, () => {
    const column = config.columns.find((c) => c.name === 'kind')
    assert.ok(column !== undefined, 'the kind column is gone')
    assert.equal(column.notNull, true)
    assert.equal(column.default, kind)
  })

  test(`${config.name}: a CHECK pins kind to '${kind}'`, () => {
    const check = config.checks.find((c) => c.name === chkName)
    assert.ok(check !== undefined, `${chkName} is not declared`)
    const text = sqlOf(check.value)
    assert.ok(text.includes('kind') && text.includes(`'${kind}'`), `${chkName} no longer pins kind to '${kind}': ${text}`)
  })

  test(`${config.name}: the composite foreign key is (escrow_id, kind) -> escrows (id, kind), cascading on delete, restricting on update`, () => {
    const fk = config.foreignKeys.find((f) => f.getName() === fkName)
    assert.ok(fk !== undefined, `${fkName} is not declared`)
    const ref = fk.reference()
    assert.deepEqual(ref.columns.map((c) => c.name), ['escrow_id', 'kind'])
    assert.deepEqual(ref.foreignColumns.map((c) => c.name), ['id', 'kind'])
    assert.equal(fk.onDelete, 'cascade', 'deleting an escrow must still take its satellite with it')
    assert.equal(fk.onUpdate, 'restrict', 'an escrow\'s kind cannot change under a satellite')
  })
}

test('escrows declares the unique (id, kind) the satellites\' keys point at', () => {
  const unique = getTableConfig(escrows).uniqueConstraints.find((u) => u.name === 'escrows_id_kind_uq')
  assert.ok(unique !== undefined, 'escrows_id_kind_uq is not declared')
  assert.deepEqual(unique.columns.map((c) => c.name), ['id', 'kind'])
})
