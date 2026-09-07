import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createQueryKey } from '../../src/pagination'

test('equivalent query objects have one stable key', () => {
  assert.equal(
    createQueryKey({ category: 'delivery', remote: true, omitted: undefined }),
    createQueryKey({ remote: true, category: 'delivery' }),
  )
})

test('different values and array order remain distinct', () => {
  assert.notEqual(createQueryKey({ remote: true }), createQueryKey({ remote: false }))
  assert.notEqual(
    createQueryKey({ status: ['open', 'accepted'] }),
    createQueryKey({ status: ['accepted', 'open'] }),
  )
})

test('non-finite numbers and nested objects normalise deterministically', () => {
  assert.equal(createQueryKey({ n: Number.NaN }), createQueryKey({ n: Number.NaN }))
  assert.equal(
    createQueryKey({ nested: { b: 2, a: 1 } }),
    createQueryKey({ nested: { a: 1, b: 2 } }),
  )
})
