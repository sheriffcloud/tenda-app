/**
 * How a slot database's URL is derived from the base one (#49).
 *
 * Worth its own test because the failure is quiet in the way that matters: the
 * pool's whole isolation guarantee is that two processes address DIFFERENT
 * databases, and that is carried entirely by this string. Drop a connection
 * parameter and every slot still connects — to a server that rejects it, or
 * worse, accepts it on different terms than the base URL asked for.
 *
 * Pure: no database, no lease, so it runs with the unit suites.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slotUrl, SLOT_COUNT } from '../helpers/test-app'

const BASE = 'postgresql://postgres:postgres@localhost:5432/tenda_test'

test('a slot is the base database with its index appended', () => {
  assert.deepEqual(slotUrl(BASE, 3), {
    url: 'postgresql://postgres:postgres@localhost:5432/tenda_test_3',
    name: 'tenda_test_3',
  })
})

test('every slot addresses a DIFFERENT database — the isolation the pool rests on', () => {
  const names = new Set<string>()
  for (let i = 1; i <= SLOT_COUNT; i += 1) names.add(slotUrl(BASE, i).name)
  assert.equal(names.size, SLOT_COUNT, 'two slots would share a database')
  assert.equal(names.has('tenda_test'), false, 'no slot may be the base database itself')
})

test('connection parameters survive, because they are part of how to connect', () => {
  // A base URL carrying `sslmode` or an application_name is ordinary outside a
  // laptop. Rebuilding the URL by string concatenation would drop them and the
  // slot would connect on terms nobody asked for.
  const withParams = `${BASE}?sslmode=require&application_name=tenda-tests`
  const { url } = slotUrl(withParams, 2)
  assert.match(url, /\/tenda_test_2\?/)
  assert.match(url, /sslmode=require/)
  assert.match(url, /application_name=tenda-tests/)
})

test('credentials and port survive too', () => {
  const { url } = slotUrl('postgresql://someone:s3cret@db.internal:6543/tenda_test', 1)
  assert.equal(url, 'postgresql://someone:s3cret@db.internal:6543/tenda_test_1')
})
