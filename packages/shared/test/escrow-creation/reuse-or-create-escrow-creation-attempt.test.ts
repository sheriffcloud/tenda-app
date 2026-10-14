import { test } from 'node:test'
import assert from 'node:assert'
import { reuseOrCreateEscrowCreationAttempt } from '../../src/escrow-creation'

test('identical retry terms reuse the operation id', () => {
  const first = reuseOrCreateEscrowCreationAttempt(null, ['chain', 'asset', '10'], () => 'op-1')
  const retry = reuseOrCreateEscrowCreationAttempt(first, ['chain', 'asset', '10'], () => 'op-2')
  assert.strictEqual(retry, first, 'the same object, so no field can rotate behind the caller')
  assert.strictEqual(retry.operationId, 'op-1')
})

test('changed terms rotate the operation id', () => {
  const first = reuseOrCreateEscrowCreationAttempt(null, ['chain', 'asset', '10'], () => 'op-1')
  const changed = reuseOrCreateEscrowCreationAttempt(first, ['chain', 'asset', '20'], () => 'op-2')
  assert.strictEqual(changed.operationId, 'op-2')
})

test('the accept window is one of the TERMS, so changing it is a new operation', () => {
  // #41: the window moved into the body as a duration and is fingerprinted with
  // everything else. That is what lets the server compare it on replay — before,
  // the deadline was pinned separately here and rewritten server-side, so it
  // could not be evidence of anything (#32).
  const hours12 = reuseOrCreateEscrowCreationAttempt(null, ['chain', 'asset', '10', 12 * 3600], () => 'op-1')
  const hours24 = reuseOrCreateEscrowCreationAttempt(hours12, ['chain', 'asset', '10', 24 * 3600], () => 'op-2')
  assert.strictEqual(hours24.operationId, 'op-2', 'a different window is a different request')

  const again = reuseOrCreateEscrowCreationAttempt(hours24, ['chain', 'asset', '10', 24 * 3600], () => 'op-3')
  assert.strictEqual(again, hours24, 'the same window is the same request')
})
