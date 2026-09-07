import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUuid } from '../../src/utils/random-uuid'

test('creates distinct RFC 4122 version 4 UUIDs', () => {
  const first = randomUuid()
  const second = randomUuid()
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.notEqual(second, first)
})
