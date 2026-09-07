import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GIG_CATEGORIES } from '../../src/constants/categories'

test('GIG_CATEGORIES: non-empty, duplicate-free, all lowercase slugs', () => {
  assert.ok(GIG_CATEGORIES.length > 0)
  assert.equal(new Set(GIG_CATEGORIES).size, GIG_CATEGORIES.length)
  for (const c of GIG_CATEGORIES) assert.match(c, /^[a-z]+$/)
})
