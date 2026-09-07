import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateWallet } from '../../src/utils/wallet'

test('truncateWallet: truncates a long address with default 4/4 window', () => {
  // slice(0,4)='9xQp', slice(-4)='3hYz', joined with a one-char ellipsis.
  assert.equal(truncateWallet('9xQpFv7c1mWq8s2RpKf3hYz'), '9xQp…3hYz')
})

test('truncateWallet: explicit prefix/suffix lengths', () => {
  assert.equal(truncateWallet('abcdefghijklmnop', 3, 2), 'abc…op')
})

test('truncateWallet: returns the address unchanged when shorter than prefix+suffix', () => {
  assert.equal(truncateWallet('abcdef', 4, 4), 'abcdef') // length 6 <= 8
})

test('truncateWallet: returns the address unchanged when exactly prefix+suffix long', () => {
  assert.equal(truncateWallet('abcdefgh', 4, 4), 'abcdefgh') // length 8 <= 8
})

test('truncateWallet: empty string returns empty string', () => {
  assert.equal(truncateWallet(''), '')
})
