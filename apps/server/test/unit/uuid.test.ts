/**
 * lib/uuid.ts — the shape guard seven modules use to keep a malformed id from
 * reaching a postgres `uuid` column, where it raises `invalid input syntax for
 * type uuid` instead of the clean 404 / `false` the caller wants.
 *
 * Moved here with the helper (it previously lived in escrow-routes.ts, which
 * was never its owner — admin auth, notifications, applications and the WS
 * channel guard all import it too).
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { isUuidLike } from '@server/lib/uuid'

test('isUuidLike: canonical lowercase UUID accepted', () => {
  assert.strictEqual(isUuidLike('550e8400-e29b-41d4-a716-446655440000'), true)
})

test('isUuidLike: uppercase hex accepted (case-insensitive)', () => {
  assert.strictEqual(isUuidLike('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'), true)
})

test('isUuidLike: rejects garbage', () => {
  assert.strictEqual(isUuidLike('garbage'), false)
})

test('isUuidLike: rejects empty string', () => {
  assert.strictEqual(isUuidLike(''), false)
})

test('isUuidLike: rejects UUID missing a section', () => {
  assert.strictEqual(isUuidLike('550e8400-e29b-41d4-a716'), false)
})

test('isUuidLike: rejects UUID with non-hex char', () => {
  assert.strictEqual(isUuidLike('550e8400-e29b-41d4-a716-44665544000z'), false)
})

test('isUuidLike: rejects UUID with extra trailing chars', () => {
  assert.strictEqual(isUuidLike('550e8400-e29b-41d4-a716-446655440000-extra'), false)
})

/**
 * The regex is anchored at both ends; without that, an id embedded in a longer
 * string would pass the guard and still blow up at the driver.
 */
test('isUuidLike: rejects a valid UUID embedded in surrounding text', () => {
  assert.strictEqual(isUuidLike(' 550e8400-e29b-41d4-a716-446655440000'), false)
  assert.strictEqual(isUuidLike('550e8400-e29b-41d4-a716-446655440000 '), false)
  assert.strictEqual(isUuidLike('id=550e8400-e29b-41d4-a716-446655440000'), false)
})

test('isUuidLike: rejects a newline-padded UUID', () => {
  // `$` alone would match before a trailing newline; the guard must not.
  assert.strictEqual(isUuidLike('550e8400-e29b-41d4-a716-446655440000\n'), false)
})
