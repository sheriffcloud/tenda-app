/**
 * The database-level rules on `gig_details`.
 *
 * What the CHECK does is proved against a real database in the server's
 * integration suite (gig-details-remote-check). This pins the part only the
 * schema can: that the constraint is DECLARED, once, under the name the
 * migration and the violation messages use. A rename or a deletion in the
 * schema file would otherwise only show up as a missing migration.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import { gig_details } from '../../src/db/schema/escrow/gig'

test('gig_details declares the remote-has-no-location constraint, exactly once', () => {
  const names = getTableConfig(gig_details).checks.map((c) => c.name)
  assert.deepEqual(names.filter((n) => n === 'gig_details_remote_no_location'), ['gig_details_remote_no_location'])
})

test('gig_details declares no other CHECK than the kind pin and the remote rule, and the remote rule covers all four location columns', () => {
  // A new rule belongs here only with its reason.
  const checks = getTableConfig(gig_details).checks
  assert.deepEqual(checks.map((c) => c.name).sort(), ['gig_details_kind_chk', 'gig_details_remote_no_location'])
  const text = new PgDialect().sqlToQuery(checks.find((c) => c.name === 'gig_details_remote_no_location')!.value).sql
  for (const column of ['country', 'city', 'latitude', 'longitude']) {
    assert.ok(text.includes(column), `the remote CHECK no longer names ${column}`)
  }
})
