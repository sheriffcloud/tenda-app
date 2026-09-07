import { classifySolanaRpcError, isRetryableSolanaRpcError } from '../errors'

test.each([
  [new TypeError('Network request failed'), 'transport'],
  [new Error('RPC timeout'), 'timeout'],
  [new Error('429 rate limited'), 'rate_limited'],
  [new Error('503 Service Unavailable'), 'transport'],
  [new Error('This transaction has already been processed'), 'already_processed'],
  [new Error('Transaction simulation failed'), 'deterministic'],
  [new Error('Transaction simulation failed: connection constraint violated'), 'deterministic'],
  [new Error('unexpected response'), 'unknown'],
] as const)('classifies %s as %s', (error, expected) => {
  expect(classifySolanaRpcError(error)).toBe(expected)
})

test('only ambiguous transport failures are automatically retryable', () => {
  expect(isRetryableSolanaRpcError(new Error('socket closed'))).toBe(true)
  expect(isRetryableSolanaRpcError(new Error('blockhash not found'))).toBe(false)
  expect(isRetryableSolanaRpcError(new Error('already processed'))).toBe(false)
  expect(isRetryableSolanaRpcError(new Error('already been processed'))).toBe(false)
  expect(isRetryableSolanaRpcError(new Error('unexpected response'))).toBe(false)
})
