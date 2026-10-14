/**
 * constants/proof-params — the poster-declared params behind checkable data
 * proofs, and the structured CONFORMANCE check. The mandatory-params rule is
 * the load-bearing one: a geotag requirement without a radius (or structured
 * without fields) would store an uncheckable requirement.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  MAX_GEOTAG_RADIUS_M,
  MAX_STRUCTURED_FIELDS,
  MAX_STRUCTURED_FIELD_NAME_LENGTH,
  MIN_GEOTAG_RADIUS_M,
  parseProofParams,
  structuredValuesProblem,
} from '../../src/constants/proof-params'
import type { StructuredProofField } from '../../src/constants/proof-params'

// ---------- parseProofParams: presence rules --------------------------------

test('no params is fine when no param-bearing type is required', () => {
  assert.deepEqual(parseProofParams([], undefined), { params: null })
  assert.deepEqual(parseProofParams(['image', 'text'], null), { params: null })
})

test('geotag/structured requirements DEMAND their params', () => {
  assert.match(parseProofParams(['geotag'], undefined).error ?? '', /geotag is required/)
  assert.match(parseProofParams(['structured'], null).error ?? '', /structured is required/)
  // A params OBJECT that still omits the required key — the object-present
  // half of the same rule.
  assert.match(parseProofParams(['geotag'], {}).error ?? '', /geotag is required/)
  assert.match(
    parseProofParams(['geotag', 'structured'], { geotag: { radius_m: 100 } }).error ?? '',
    /structured is required/,
  )
})

test('params for a type the gig does not require are refused, not stored dead', () => {
  assert.match(
    parseProofParams(['image'], { geotag: { radius_m: 100 } }).error ?? '',
    /only valid when geotag proof is required/,
  )
  assert.match(
    parseProofParams(['geotag'], { geotag: { radius_m: 100 }, structured: { fields: [] } })
      .error ?? '',
    /only valid when structured proof is required/,
  )
})

test('unknown top-level keys are refused (text and file types take no params)', () => {
  assert.match(parseProofParams(['text'], { text: {} }).error ?? '', /unknown keys: text/)
  assert.match(parseProofParams(['image'], { image: {} }).error ?? '', /unknown keys: image/)
})

test('non-object params are refused', () => {
  assert.notEqual(parseProofParams(['geotag'], 'x').error, undefined)
  assert.notEqual(parseProofParams(['geotag'], [1]).error, undefined)
})

test('non-object per-type params are refused', () => {
  assert.match(parseProofParams(['geotag'], { geotag: 'near' }).error ?? '', /must be an object/)
  assert.match(
    parseProofParams(['structured'], { structured: 5 }).error ?? '',
    /must be an object/,
  )
})

// ---------- parseProofParams: geotag ----------------------------------------

test('geotag params accept an in-range integer radius', () => {
  assert.deepEqual(parseProofParams(['geotag'], { geotag: { radius_m: 500 } }).params, {
    geotag: { radius_m: 500 },
  })
})

test('geotag radius bounds are inclusive', () => {
  assert.equal(
    parseProofParams(['geotag'], { geotag: { radius_m: MIN_GEOTAG_RADIUS_M } }).error,
    undefined,
  )
  assert.equal(
    parseProofParams(['geotag'], { geotag: { radius_m: MAX_GEOTAG_RADIUS_M } }).error,
    undefined,
  )
})

test('geotag refuses out-of-bounds, fractional and non-numeric radii', () => {
  for (const radius of [MIN_GEOTAG_RADIUS_M - 1, MAX_GEOTAG_RADIUS_M + 1, 10.5, '500', NaN]) {
    assert.notEqual(
      parseProofParams(['geotag'], { geotag: { radius_m: radius } }).error,
      undefined,
      String(radius),
    )
  }
})

test('geotag refuses unknown keys', () => {
  assert.match(
    parseProofParams(['geotag'], { geotag: { radius_m: 100, center: 'here' } }).error ?? '',
    /unknown keys: center/,
  )
})

// ---------- parseProofParams: structured ------------------------------------

const field = (over: Partial<StructuredProofField> = {}): StructuredProofField => ({
  name: 'count',
  kind: 'number',
  required: true,
  ...over,
})

test('structured params accept declared fields and trim their names', () => {
  const parsed = parseProofParams(['structured'], {
    structured: { fields: [{ name: '  count ', kind: 'number', required: true }] },
  })
  assert.deepEqual(parsed.params, { structured: { fields: [field()] } })
})

test('structured refuses an empty or oversized field list', () => {
  assert.notEqual(
    parseProofParams(['structured'], { structured: { fields: [] } }).error,
    undefined,
  )
  const many = Array.from({ length: MAX_STRUCTURED_FIELDS + 1 }, (_, i) => field({ name: `f${i}` }))
  assert.notEqual(
    parseProofParams(['structured'], { structured: { fields: many } }).error,
    undefined,
  )
})

test('structured refuses duplicate names, bad kinds, bad names and non-boolean required', () => {
  const cases: unknown[] = [
    [field(), field()], // duplicate name
    [field({ kind: 'date' as StructuredProofField['kind'] })],
    [field({ name: '' })],
    [field({ name: `a${String.fromCharCode(0)}b` })], // NUL — jsonb cannot store it
    [{ ...field(), name: 3 }], // non-string name — must refuse, not coerce
    [field({ name: 'x'.repeat(MAX_STRUCTURED_FIELD_NAME_LENGTH + 1) })],
    [{ name: 'a', kind: 'string', required: 'yes' }],
    ['not-an-object'],
  ]
  for (const fields of cases) {
    assert.notEqual(
      parseProofParams(['structured'], { structured: { fields } }).error,
      undefined,
      JSON.stringify(fields),
    )
  }
})

test('structured refuses unknown keys on the params and on each field', () => {
  assert.match(
    parseProofParams(['structured'], { structured: { fields: [field()], strict: true } }).error ??
      '',
    /unknown keys: strict/,
  )
  assert.match(
    parseProofParams(['structured'], {
      structured: { fields: [{ ...field(), hint: 'x' }] },
    }).error ?? '',
    /unknown keys: hint/,
  )
})

test('both param sets parse together when both types are required', () => {
  const parsed = parseProofParams(['geotag', 'structured'], {
    geotag: { radius_m: 250 },
    structured: { fields: [field()] },
  })
  assert.deepEqual(parsed.params, {
    geotag: { radius_m: 250 },
    structured: { fields: [field()] },
  })
})

// ---------- structuredValuesProblem -----------------------------------------

const FIELDS: StructuredProofField[] = [
  { name: 'count', kind: 'number', required: true },
  { name: 'note', kind: 'string', required: false },
  { name: 'done', kind: 'boolean', required: true },
]

test('conformant values pass, optional fields may be absent', () => {
  assert.equal(structuredValuesProblem(FIELDS, { count: 3, done: true }), null)
  assert.equal(structuredValuesProblem(FIELDS, { count: 3, done: false, note: 'ok' }), null)
})

test('a missing required field is named', () => {
  assert.match(structuredValuesProblem(FIELDS, { count: 3 }) ?? '', /"done" is required/)
})

test('a kind mismatch is named', () => {
  assert.match(
    structuredValuesProblem(FIELDS, { count: '3', done: true }) ?? '',
    /"count" must be a number/,
  )
})

test('an undeclared value is refused — the payload must match the declared shape', () => {
  assert.match(
    structuredValuesProblem(FIELDS, { count: 3, done: true, extra: 1 }) ?? '',
    /"extra" is not a declared field/,
  )
})

test('a field named "__proto__" is judged by its OWN value, never by the prototype', () => {
  // `values[name]` on a plain object answers Object.prototype for that name
  // when no own key exists, so the check would say "must be a number" for a
  // field the worker never answered — and, worse, would pass an inherited
  // object off as an answer. Own-property lookups only.
  const fields: StructuredProofField[] = [{ name: '__proto__', kind: 'number', required: true }]
  assert.match(structuredValuesProblem(fields, {}) ?? '', /"__proto__" is required/)
  const answered = Object.fromEntries([['__proto__', 3]]) as Record<string, number>
  assert.equal(structuredValuesProblem(fields, answered), null)
})
