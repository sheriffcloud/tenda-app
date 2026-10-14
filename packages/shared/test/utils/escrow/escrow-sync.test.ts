/** Read-through convergence check (ported from mobile when the module moved here). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkEscrowTransitionApplied } from '../../../src/utils/escrow/escrow-sync'
import type { EscrowSyncProjection } from '../../../src/constants/escrow-transitions'

function reader(projection: EscrowSyncProjection) {
  let calls = 0
  return {
    read: async () => {
      calls += 1
      return projection
    },
    calls: () => calls,
  }
}

test('does not perform an authoritative read without a pending action', async () => {
  const { read, calls } = reader({ status: 'open' })
  assert.equal(await checkEscrowTransitionApplied(null, read), false)
  assert.equal(calls(), 0)
})

test('recognizes the expected status transition', async () => {
  const { read } = reader({ status: 'submitted' })
  assert.equal(await checkEscrowTransitionApplied('submit', read), true)
})

test('rejects a stale status even after a chain receipt', async () => {
  const { read } = reader({ status: 'accepted' })
  assert.equal(await checkEscrowTransitionApplied('submit', read), false)
})

test('requires assignment evidence for an open-to-open decline', async () => {
  const still = reader({ status: 'open', is_assigned: true })
  const cleared = reader({ status: 'open', is_assigned: false })
  assert.equal(await checkEscrowTransitionApplied('decline', still.read), false)
  assert.equal(await checkEscrowTransitionApplied('decline', cleared.read), true)
})
