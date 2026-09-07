import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ESCROW_TRANSITION_SYNC,
  ESCROW_TX_TYPES,
  hasAppliedEscrowTransition,
} from '../../src/constants'

test('every escrow action has exactly one convergence rule', () => {
  assert.deepEqual(Object.keys(ESCROW_TRANSITION_SYNC).sort(), [...ESCROW_TX_TYPES].sort())
})

test('status-changing actions converge only on their authoritative destination', () => {
  assert.equal(hasAppliedEscrowTransition('accept', { status: 'open' }), false)
  assert.equal(hasAppliedEscrowTransition('accept', { status: 'accepted' }), true)
  assert.equal(hasAppliedEscrowTransition('submit', { status: 'accepted' }), false)
  assert.equal(hasAppliedEscrowTransition('submit', { status: 'submitted' }), true)
})

test('decline cannot falsely converge from its unchanged open status', () => {
  assert.equal(hasAppliedEscrowTransition('decline', { status: 'open', is_assigned: true }), false)
  assert.equal(hasAppliedEscrowTransition('decline', { status: 'open' }), false)
  assert.equal(hasAppliedEscrowTransition('decline', { status: 'open', is_assigned: false }), true)
})
