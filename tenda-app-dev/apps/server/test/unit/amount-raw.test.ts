/**
 * `isAmountRaw` type-guard. Closes open_issues.md S0-6 — wraps the boundary
 * check that prevents `BigInt('garbage')` from throwing uncaught downstream.
 */

import { test } from 'node:test'
import * as assert from 'node:assert'
import { isAmountRaw } from '@server/chains/types'

test('isAmountRaw: accepts 0', () => {
  assert.strictEqual(isAmountRaw('0'), true)
})

test('isAmountRaw: accepts small positive', () => {
  assert.strictEqual(isAmountRaw('1000000'), true)
})

test('isAmountRaw: accepts 78-digit max', () => {
  assert.strictEqual(isAmountRaw('9'.repeat(78)), true)
})

test('isAmountRaw: rejects empty string', () => {
  assert.strictEqual(isAmountRaw(''), false)
})

test('isAmountRaw: rejects leading zero(s)', () => {
  assert.strictEqual(isAmountRaw('01'), false)
  assert.strictEqual(isAmountRaw('000'), false)
})

test('isAmountRaw: rejects negative', () => {
  assert.strictEqual(isAmountRaw('-1'), false)
})

test('isAmountRaw: rejects decimal point', () => {
  assert.strictEqual(isAmountRaw('1.5'), false)
})

test('isAmountRaw: rejects whitespace', () => {
  assert.strictEqual(isAmountRaw(' 42'), false)
  assert.strictEqual(isAmountRaw('42 '), false)
  assert.strictEqual(isAmountRaw('4 2'), false)
})

test('isAmountRaw: rejects scientific notation', () => {
  assert.strictEqual(isAmountRaw('1e10'), false)
})

test('isAmountRaw: rejects non-string types', () => {
  assert.strictEqual(isAmountRaw(42), false)
  assert.strictEqual(isAmountRaw(null), false)
  assert.strictEqual(isAmountRaw(undefined), false)
  assert.strictEqual(isAmountRaw(BigInt(42)), false)
})

test('isAmountRaw: rejects letters', () => {
  assert.strictEqual(isAmountRaw('garbage'), false)
  assert.strictEqual(isAmountRaw('1a2'), false)
})
