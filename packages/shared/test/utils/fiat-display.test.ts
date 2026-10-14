import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INTENT_STATUS_COPY,
  instructionCopy,
  isCancellable,
  isTerminal,
} from '../../src/utils/fiat-display'
import type { FiatIntentStatus } from '../../src/api/contracts/fiat.contract'

const ALL_STATUSES: FiatIntentStatus[] = [
  'quoted',
  'awaiting_user',
  'awaiting_provider',
  'settling',
  'settled',
  'failed',
  'cancelled',
]

test('instructionCopy: offramp deposit target, with and without memo', () => {
  assert.equal(
    instructionCopy({ deposit_address: 'addr1', memo: 'ref-9' }),
    'Send the exact amount to addr1 (memo: ref-9).',
  )
  assert.equal(instructionCopy({ deposit_address: 'addr1', memo: null }), 'Send the exact amount to addr1.')
})

test('instructionCopy: each provider instruction kind gets actionable copy', () => {
  assert.equal(
    instructionCopy({
      kind: 'bank_transfer',
      bank_name: 'GTB',
      account_number: '0123456789',
      account_name: 'Tenda Ltd',
      narration: 'TND-1',
    }),
    'Transfer to GTB 0123456789 (Tenda Ltd). Use narration: TND-1',
  )
  assert.equal(instructionCopy({ kind: 'ussd', code: '*737*1#' }), 'Dial *737*1# to complete payment.')
  assert.match(instructionCopy({ kind: 'redirect', url: 'https://pay.example' }), /provider page/)
  assert.match(instructionCopy({ kind: 'p2p', offer_id: 'offer-1' }), /P2P exchange/)
})

test('INTENT_STATUS_COPY: every status has non-empty copy', () => {
  for (const status of ALL_STATUSES) {
    assert.equal(typeof INTENT_STATUS_COPY[status], 'string')
    assert.notEqual(INTENT_STATUS_COPY[status], '')
  }
})

test('isCancellable: only pre-payment statuses', () => {
  const cancellable = ALL_STATUSES.filter(isCancellable)
  assert.deepEqual(cancellable, ['quoted', 'awaiting_user'])
})

test('isTerminal: exactly the polling-stop statuses', () => {
  const terminal = ALL_STATUSES.filter(isTerminal)
  assert.deepEqual(terminal, ['settled', 'failed', 'cancelled'])
})
