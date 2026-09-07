import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { resolveSolanaTransactionStatus } from '../../src/utils/solana-transaction-status'

describe('resolveSolanaTransactionStatus', () => {
  it('distinguishes missing, failed, confirmed and finalized signatures', () => {
    assert.equal(resolveSolanaTransactionStatus(null), 'not_found')
    assert.equal(resolveSolanaTransactionStatus({ err: { instruction: 1 } }), 'failed')
    assert.equal(
      resolveSolanaTransactionStatus({ err: null, confirmationStatus: 'confirmed' }),
      'confirmed',
    )
    assert.equal(
      resolveSolanaTransactionStatus({ err: null, confirmationStatus: 'finalized' }),
      'finalized',
    )
  })

  it('keeps processed and unclassified successful states pending', () => {
    assert.equal(
      resolveSolanaTransactionStatus({ err: null, confirmationStatus: 'processed' }),
      'not_found',
    )
    assert.equal(resolveSolanaTransactionStatus({ err: null }), 'not_found')
  })
})
