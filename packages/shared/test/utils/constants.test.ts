import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LAMPORTS_PER_SOL } from '../../src/utils/constants'

test('LAMPORTS_PER_SOL is 1e9', () => {
  assert.equal(LAMPORTS_PER_SOL, 1_000_000_000)
})
