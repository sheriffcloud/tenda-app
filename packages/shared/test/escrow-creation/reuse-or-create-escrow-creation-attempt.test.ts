import { test } from 'node:test'
import assert from 'node:assert'
import { reuseOrCreateEscrowCreationAttempt } from '../../src/escrow-creation'

test('identical retry terms reuse the operation and exact deadline', () => {
  const first = reuseOrCreateEscrowCreationAttempt(null, ['chain', 'asset', '10'], () => 100, () => 'op-1')
  const retry = reuseOrCreateEscrowCreationAttempt(first, ['chain', 'asset', '10'], () => 200, () => 'op-2')
  assert.strictEqual(retry, first)
  assert.strictEqual(retry.acceptDeadlineUnix, 100)
})

test('changed terms rotate the operation and deadline', () => {
  const first = reuseOrCreateEscrowCreationAttempt(null, ['chain', 'asset', '10'], () => 100, () => 'op-1')
  const changed = reuseOrCreateEscrowCreationAttempt(first, ['chain', 'asset', '20'], () => 200, () => 'op-2')
  assert.strictEqual(changed.operationId, 'op-2')
  assert.strictEqual(changed.acceptDeadlineUnix, 200)
})
