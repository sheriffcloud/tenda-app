import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ErrorCode } from '../../src/constants/errors'

test('ErrorCode: every entry is a self-referential key===value pair (no typos)', () => {
  for (const [key, value] of Object.entries(ErrorCode)) {
    assert.equal(key, value, `${key} must equal its string value`)
  }
})

test('ErrorCode: values are unique', () => {
  const values = Object.values(ErrorCode)
  assert.equal(new Set(values).size, values.length)
})

test('ErrorCode: includes the generic NOT_FOUND / VALIDATION_ERROR / INTERNAL_ERROR codes', () => {
  assert.equal(ErrorCode.NOT_FOUND, 'NOT_FOUND')
  assert.equal(ErrorCode.VALIDATION_ERROR, 'VALIDATION_ERROR')
  assert.equal(ErrorCode.INTERNAL_ERROR, 'INTERNAL_ERROR')
})
