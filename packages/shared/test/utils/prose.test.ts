import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prose } from '../../src/utils/prose'

/**
 * The joiner every derived list runs through — the landing's chain stamps and,
 * since it moved here, the support pages' chain sentences. Its failure mode is
 * not a crash: it is a sentence that reads wrong to a reader and to nobody
 * else, which is exactly the kind of defect a public page ships for months.
 *
 * Rewritten from vitest to node:test on the move; shared's suite has no vitest.
 */
test('prose renders a single item with no conjunction', () => {
  assert.equal(prose(['Celo']), 'Celo')
})

test('prose joins two items with "and" and no comma', () => {
  assert.equal(prose(['Celo', 'Base']), 'Celo and Base')
})

test('prose commas all but the last, which takes the "and"', () => {
  assert.equal(prose(['Celo', 'Base', 'Solana']), 'Celo, Base and Solana')
})

test('prose keeps the pattern past three', () => {
  assert.equal(prose(['a', 'b', 'c', 'd']), 'a, b, c and d')
})

/**
 * The empty case is reachable: every derived list filters (by namespace, by
 * gas policy, by whether a chain declares a strength), so a filter that matches
 * nothing must yield an empty string, not "undefined" or a dangling " and ".
 */
test('prose returns an empty string for an empty list rather than a fragment', () => {
  assert.equal(prose([]), '')
})
