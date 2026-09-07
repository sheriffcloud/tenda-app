/**
 * The schema builders behind the Agent API document. They are what make
 * "closed", "bound to a wire type" and "nullable" mean one thing everywhere in
 * src/agent-api —
 * a builder that quietly produced an open object, or a null-union that a
 * strict validator refuses to compile, would undo the drift guarantee at its
 * root.
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { allKeys, closed, closedFor, nullable, ref } from '@server/agent-api/schema-types'
import { strictAjv } from '../helpers/agent-api-validator'

test('closed() admits exactly the documented keys, requires the listed ones, and carries the description', () => {
  const schema = closed({ a: { type: 'string' }, b: { type: 'integer' } }, ['a'], 'pair')
  assert.strictEqual(schema.additionalProperties, false)
  assert.strictEqual(schema.description, 'pair')
  const validate = strictAjv().compile(schema)
  assert.strictEqual(validate({ a: 'x' }), true)
  assert.strictEqual(validate({ a: 'x', b: 2 }), true)
  assert.strictEqual(validate({ b: 2 }), false, 'a required key is missing')
  assert.strictEqual(validate({ a: 'x', c: true }), false, 'an undocumented key is refused')
  // No description → no `description` key, so the emitted JSON has no `undefined`.
  assert.strictEqual('description' in closed({}, []), false)
})

test('nullable() adds null to a single type ONCE, and wraps type-less schemas in oneOf', () => {
  assert.deepStrictEqual(nullable({ type: 'string' }).type, ['string', 'null'])
  // Already nullable: returned as it is, never `['string', 'null', 'null']`.
  const already = nullable({ type: 'string' })
  assert.strictEqual(nullable(already), already)
  // A list without null gains it — the arm a single type never exercises.
  assert.deepStrictEqual(nullable({ type: ['integer'] }).type, ['integer', 'null'])
  const wrapped = nullable({ oneOf: [{ type: 'string' }] })
  assert.deepStrictEqual(wrapped, { oneOf: [{ oneOf: [{ type: 'string' }] }, { type: 'null' }] })
  const wrappedRef = nullable(ref('GigSummary'))
  assert.deepStrictEqual(wrappedRef, { oneOf: [{ $ref: '#/components/schemas/GigSummary' }, { type: 'null' }] })
})

test('every nullable() form compiles under a STRICT validator and accepts null', () => {
  // Strict ajv refuses every type list but `X | null` — including the
  // contradictory `type: ['null']` beside a oneOf from the document's first
  // draft, and a doubled `['string', 'null', 'null']`.
  const ajv = strictAjv()
  for (const schema of [
    nullable({ type: 'string' }),
    nullable(nullable({ type: 'string' })),
    nullable({ type: ['string'] }),
    nullable({ oneOf: [{ type: 'string' }, { type: 'number' }] }),
  ]) {
    const validate = ajv.compile(schema)
    assert.strictEqual(validate(null), true)
    assert.strictEqual(validate('x'), true)
    assert.strictEqual(validate(true), false)
  }
})

test('ref() spells the components prefix once', () => {
  assert.deepStrictEqual(ref('GigSummary'), { $ref: '#/components/schemas/GigSummary' })
})

test('nullable() on an enum admits null as a VALUE, not only as a type — the country of a poster with none', () => {
  const validate = strictAjv().compile(nullable({ type: 'string', enum: ['NG', 'KE'] }))
  assert.strictEqual(validate('NG'), true)
  assert.strictEqual(validate(null), true, 'null must pass the enum whitelist too')
  assert.strictEqual(validate('ZZ'), false)
  // Idempotent: applying it twice adds null once.
  assert.deepStrictEqual(nullable(nullable({ type: 'string', enum: ['NG'] })).enum, ['NG', null])
})

// ---------- closedFor / allKeys: the binding to a wire type -------------------
//
// The value of `closedFor` is at COMPILE time, so its proofs are `@ts-expect-error`
// lines — each one a schema that must NOT type-check. `tsc -p test/tsconfig.json`
// (the test gate) fails if any of them starts compiling, i.e. if the binding
// stops biting. The runtime half is one assertion: the JSON is `closed()`'s.

interface Wire {
  id: string
  note?: string | null
}

test('closedFor() emits exactly what closed() emits — the binding is compile-time only', () => {
  const bound = closedFor<Wire>({ id: { type: 'string' }, note: nullable({ type: 'string' }) }, ['id'], 'w')
  assert.deepStrictEqual(bound, closed({ id: { type: 'string' }, note: nullable({ type: 'string' }) }, ['id'], 'w'))
})

test('closedFor() refuses a missing key, an undocumented key, and an optional key listed as required', () => {
  // @ts-expect-error — `note` is a key of Wire and is not documented.
  closedFor<Wire>({ id: { type: 'string' } }, ['id'])
  // @ts-expect-error — `nota` is not a key of Wire.
  closedFor<Wire>({ id: { type: 'string' }, note: { type: 'string' }, nota: { type: 'string' } }, ['id'])
  // @ts-expect-error — `note` is optional on Wire, so it cannot be required.
  closedFor<Wire>({ id: { type: 'string' }, note: { type: 'string' } }, ['id', 'note'])
  // The well-formed call is the control: it compiles, and it is closed.
  assert.strictEqual(closedFor<Wire>({ id: { type: 'string' }, note: { type: 'string' } }, ['id']).additionalProperties, false)
})

test('allKeys() lists every documented key, and only compiles for a type with no optional key', () => {
  interface AllRequired {
    a: string
    b: number
  }
  const properties = { a: { type: 'string' }, b: { type: 'integer' } } as const
  assert.deepStrictEqual(allKeys<AllRequired>(properties), ['a', 'b'])
  // `required` accepts it directly — the two key sets are the same type.
  assert.deepStrictEqual(closedFor<AllRequired>(properties, allKeys<AllRequired>(properties)).required, ['a', 'b'])
  // @ts-expect-error — Wire has an optional key, so "every key is required" is false and refused.
  closedFor<Wire>({ id: { type: 'string' }, note: { type: 'string' } }, allKeys<Wire>({ id: { type: 'string' }, note: { type: 'string' } }))
})
