/**
 * The wallet barrel's one real export.
 *
 * `wallet/index.ts` reads as a re-export barrel and is excluded from nothing,
 * but it owns `getTransactionStatus` — the Solana tx-status read the escrow
 * monitor converges on. It sat at 0%: the file looked like a barrel, so
 * nobody tested it, and the coverage table showed the whole `wallet/` folder
 * dragged down without saying which function was missing.
 */
// The fn is created INSIDE the factory and retrieved from the mocked module
// below — `jest.mock` is hoisted above module-scope `const`, so a factory that
// closes over one captures `undefined`. Same note as dispatch.test.ts.
jest.mock('@/wallet/solana-rpc', () => ({
  solanaRpcTransport: { getTransactionStatus: jest.fn() },
}))

import { solanaRpcTransport } from '@/wallet/solana-rpc'
import { getTransactionStatus } from '@/wallet'

const mockGetTransactionStatus = solanaRpcTransport.getTransactionStatus as jest.Mock

beforeEach(() => {
  mockGetTransactionStatus.mockReset()
})

test('delegates to the RPC transport, and answers with what it says', async () => {
  mockGetTransactionStatus.mockResolvedValue('confirmed')
  await expect(getTransactionStatus('sig-1')).resolves.toBe('confirmed')
  expect(mockGetTransactionStatus).toHaveBeenCalledWith('sig-1')
})

test('passes a NOT-FOUND status straight through rather than treating it as failure', async () => {
  // The monitor distinguishes "not on chain yet" from "failed"; collapsing
  // them here would make a pending tx look like a lost one.
  //
  // 'not_found' is the literal the union actually carries
  // (OnChainTransactionStatus = confirmed | finalized | failed | not_found).
  // This asserted 'unknown' until the audit checked it against the producer —
  // a status no caller can ever emit, so the test proved nothing.
  mockGetTransactionStatus.mockResolvedValue('not_found')
  await expect(getTransactionStatus('sig-2')).resolves.toBe('not_found')
})

test('passes a finalized status through unchanged', async () => {
  mockGetTransactionStatus.mockResolvedValue('finalized')
  await expect(getTransactionStatus('sig-4')).resolves.toBe('finalized')
})

test('lets a transport failure propagate — a swallowed error reads as "not found"', async () => {
  mockGetTransactionStatus.mockRejectedValue(new Error('rpc down'))
  await expect(getTransactionStatus('sig-3')).rejects.toThrow('rpc down')
})
