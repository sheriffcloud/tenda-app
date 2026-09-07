import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { withTimeout } from '../../../src/utils/async/with-timeout'

describe('withTimeout', () => {
  it('returns an operation result before its deadline', async () => {
    assert.equal(await withTimeout(Promise.resolve('ok'), 100), 'ok')
  })

  it('preserves an operation rejection before its deadline', async () => {
    const failure = new Error('rpc rejected')
    await assert.rejects(withTimeout(Promise.reject(failure), 100), failure)
  })

  it('rejects a hung operation with the default deadline message', async () => {
    await assert.rejects(
      withTimeout(new Promise<string>(() => {}), 1),
      /operation timed out after 1ms/,
    )
  })

  it('supports a domain-specific timeout message', async () => {
    await assert.rejects(
      withTimeout(new Promise<string>(() => {}), 1, 'solana rpc timeout'),
      /solana rpc timeout/,
    )
  })

  it('rejects invalid budgets before starting a timer', async () => {
    await assert.rejects(withTimeout(Promise.resolve('unused'), 0), RangeError)
    await assert.rejects(withTimeout(Promise.resolve('unused'), -1), RangeError)
    await assert.rejects(withTimeout(Promise.resolve('unused'), Number.POSITIVE_INFINITY), RangeError)
  })
})
