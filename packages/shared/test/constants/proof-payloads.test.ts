/**
 * constants/proof-payloads — SHAPE validation of data-proof payloads. Every
 * branch gets a positive and a negative: these strings become 400 messages,
 * and a payload that slips through malformed is stored as identity and read
 * by machines downstream.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import {
  MAX_PROOF_TEXT_LENGTH,
  MAX_STRUCTURED_STRING_VALUE_LENGTH,
  parseProofPayload,
} from '../../src/constants/proof-payloads'
// The value caps ARE the declaration side's constants (see proof-payloads):
// asserting through them proves the two validators cannot drift apart.
import {
  MAX_STRUCTURED_FIELDS,
  MAX_STRUCTURED_FIELD_NAME_LENGTH,
} from '../../src/constants/proof-params'

// ---------- shared shape rules ---------------------------------------------

test('every data type refuses a non-object payload', () => {
  for (const type of ['geotag', 'text', 'structured'] as const) {
    for (const bad of [undefined, null, 'x', 3, true, ['a']]) {
      assert.notEqual(parseProofPayload(type, bad).error, undefined, `${type} ${String(bad)}`)
    }
  }
})

// ---------- geotag ----------------------------------------------------------

test('geotag accepts valid coordinates', () => {
  const parsed = parseProofPayload('geotag', { latitude: 6.5244, longitude: 3.3792 })
  assert.deepEqual(parsed.payload, { latitude: 6.5244, longitude: 3.3792 })
})

test('geotag accepts the boundary coordinates', () => {
  assert.equal(parseProofPayload('geotag', { latitude: 90, longitude: -180 }).error, undefined)
})

test('geotag refuses out-of-range or non-numeric coordinates', () => {
  assert.notEqual(parseProofPayload('geotag', { latitude: 91, longitude: 0 }).error, undefined)
  assert.notEqual(parseProofPayload('geotag', { latitude: 0, longitude: 181 }).error, undefined)
  assert.notEqual(parseProofPayload('geotag', { latitude: NaN, longitude: 0 }).error, undefined)
  assert.notEqual(parseProofPayload('geotag', { latitude: '6.5', longitude: 3 }).error, undefined)
  assert.notEqual(parseProofPayload('geotag', { latitude: 6.5 }).error, undefined)
})

test('geotag refuses unknown keys — the payload is identity', () => {
  const parsed = parseProofPayload('geotag', { latitude: 1, longitude: 2, accuracy: 5 })
  assert.match(parsed.error ?? '', /unknown keys: accuracy/)
})

// ---------- text ------------------------------------------------------------

test('text trims and accepts a real answer', () => {
  assert.deepEqual(parseProofPayload('text', { text: '  done, receipt #42  ' }).payload, {
    text: 'done, receipt #42',
  })
})

test('text refuses empty, whitespace-only, oversize and non-string', () => {
  assert.notEqual(parseProofPayload('text', { text: '' }).error, undefined)
  assert.notEqual(parseProofPayload('text', { text: '   ' }).error, undefined)
  assert.notEqual(
    parseProofPayload('text', { text: 'x'.repeat(MAX_PROOF_TEXT_LENGTH + 1) }).error,
    undefined,
  )
  assert.notEqual(parseProofPayload('text', { text: 42 }).error, undefined)
})

test('text at exactly the cap is accepted', () => {
  assert.equal(
    parseProofPayload('text', { text: 'x'.repeat(MAX_PROOF_TEXT_LENGTH) }).error,
    undefined,
  )
})

test('text refuses unknown keys', () => {
  assert.match(parseProofPayload('text', { text: 'ok', extra: 1 }).error ?? '', /unknown keys/)
})

// ---------- structured ------------------------------------------------------

test('structured accepts string, number and boolean values', () => {
  const parsed = parseProofPayload('structured', {
    values: { count: 3, ok: true, note: 'left at door' },
  })
  assert.deepEqual(parsed.payload, { values: { count: 3, ok: true, note: 'left at door' } })
})

test('structured refuses empty values, a missing values object, and arrays', () => {
  assert.notEqual(parseProofPayload('structured', { values: {} }).error, undefined)
  assert.notEqual(parseProofPayload('structured', {}).error, undefined)
  assert.notEqual(parseProofPayload('structured', { values: ['a'] }).error, undefined)
})

test('structured refuses non-scalar and non-finite values', () => {
  assert.notEqual(parseProofPayload('structured', { values: { a: {} } }).error, undefined)
  assert.notEqual(parseProofPayload('structured', { values: { a: null } }).error, undefined)
  assert.notEqual(parseProofPayload('structured', { values: { a: Infinity } }).error, undefined)
})

test('structured enforces the entry, key-length and string-value caps', () => {
  const tooMany = Object.fromEntries(
    Array.from({ length: MAX_STRUCTURED_FIELDS + 1 }, (_, i) => [`k${i}`, 1]),
  )
  assert.notEqual(parseProofPayload('structured', { values: tooMany }).error, undefined)
  assert.notEqual(
    parseProofPayload('structured', { values: { ['k'.repeat(MAX_STRUCTURED_FIELD_NAME_LENGTH + 1)]: 1 } })
      .error,
    undefined,
  )
  assert.notEqual(
    parseProofPayload('structured', {
      values: { a: 'v'.repeat(MAX_STRUCTURED_STRING_VALUE_LENGTH + 1) },
    }).error,
    undefined,
  )
})

test('structured PRESERVES a "__proto__" value key as data, never as a prototype', () => {
  // `values[key] = raw` hits the Object.prototype "__proto__" SETTER, which
  // silently drops the entry: the stored payload then differs from what was
  // sent, and a payload of ONLY that key slipped past "cannot be empty" as an
  // accepted-but-empty object. JSON.parse is the only way to build the
  // hostile input — an object literal's "__proto__" is the proto-setting form.
  const hostile = JSON.parse('{"values":{"__proto__":"x","ok":1}}')
  const parsed = parseProofPayload('structured', hostile)
  assert.equal(parsed.error, undefined)
  const payload = parsed.payload
  assert.ok(payload !== undefined && 'values' in payload)
  assert.deepEqual(Object.keys(payload.values).sort(), ['__proto__', 'ok'])
  const onlyProto = parseProofPayload('structured', JSON.parse('{"values":{"__proto__":"x"}}')).payload
  assert.ok(onlyProto !== undefined && 'values' in onlyProto)
  assert.deepEqual(Object.keys(onlyProto.values), ['__proto__'])
})

test('a NUL character is refused everywhere jsonb would choke on it', () => {
  // Postgres jsonb cannot store \u0000 ("unsupported Unicode escape
  // sequence" — measured); without this refusal a NUL in any payload string
  // became a driver error and a 500 instead of a 400.
  const NUL = String.fromCharCode(0)
  assert.match(parseProofPayload('text', { text: `a${NUL}b` }).error ?? '', /null character/)
  assert.match(
    parseProofPayload('structured', { values: { [`k${NUL}`]: 1 } }).error ?? '',
    /null character/,
  )
  assert.match(
    parseProofPayload('structured', { values: { a: `v${NUL}` } }).error ?? '',
    /null character/,
  )
})

test('structured refuses unknown top-level keys', () => {
  assert.match(
    parseProofPayload('structured', { values: { a: 1 }, schema: 'x' }).error ?? '',
    /unknown keys: schema/,
  )
})
