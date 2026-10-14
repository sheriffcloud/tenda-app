/**
 * toWire: a row as a client receives it. Fastify serialises a returned Date
 * through toJSON, so the wire form is the JSON round trip; the helper exists so the
 * DECLARED type (Wire<Row> in AdminContract) is what the compiler holds a handler to.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toWire } from '@server/lib/http/wire'

test('every Date becomes its ISO string, a null Date stays null, and everything else is untouched', () => {
  const at = new Date('2026-10-05T10:00:00.000Z')
  const wire = toWire({ id: 'a', created_at: at, reviewed_at: null as Date | null, count: 3, flag: true, note: null as string | null })
  assert.deepEqual(wire, { id: 'a', created_at: '2026-10-05T10:00:00.000Z', reviewed_at: null, count: 3, flag: true, note: null })
})

test('it is exactly what the reply would carry: JSON.stringify of the original and of the wire form are the same bytes', () => {
  const row = { at: new Date('2026-01-02T03:04:05.000Z'), nested: { when: new Date('2026-01-02T03:04:05.000Z'), n: 1 }, list: [1, 2] }
  assert.equal(JSON.stringify(toWire(row)), JSON.stringify(row))
})

test('a jsonb column is left as it is (the helper is shallow on the type, but the data round-trips unchanged)', () => {
  const wire = toWire({ metadata: { a: [1, { b: 'c' }], d: null } })
  assert.deepEqual(wire, { metadata: { a: [1, { b: 'c' }], d: null } })
})
