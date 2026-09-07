import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { TRANSACTION_COPY } from '../../src/constants/transaction-copy'
import { TRANSACTION_RESILIENCE } from '../../src/constants/transaction-resilience'

describe('shared transaction client contract', () => {
  it('keeps every timing budget finite and positive', () => {
    for (const value of Object.values(TRANSACTION_RESILIENCE)) {
      assert.equal(Number.isFinite(value), true)
      assert.equal(value > 0, true)
    }
  })

  it('keeps all reusable progress and recovery messages non-empty', () => {
    for (const value of Object.values(TRANSACTION_COPY)) {
      assert.equal(value.trim().length > 0, true)
    }
  })

  it('shows the slow-network notice before the transaction confirmation deadline', () => {
    assert.equal(
      TRANSACTION_RESILIENCE.slowOperationNoticeMs < TRANSACTION_RESILIENCE.confirmationTimeoutMs,
      true,
    )
  })
})
