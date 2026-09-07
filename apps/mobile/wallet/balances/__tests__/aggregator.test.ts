/**
 * readWalletBalances + sumUsdcRaw, the multichain fan-out. Verifies it pairs
 * each wallet with same-namespace enabled chains (an EVM address across two EVM
 * chains), picks USDC + native from each read, sums USDC across chains in exact
 * base units, and survives a reader rejection.
 */
import type { ChainRegistryEntry } from '@tenda/shared'

const mockSolRead = jest.fn()
const mockEvmRead = jest.fn()
jest.mock('@/wallet/balances/solana', () => ({ solanaBalanceReader: { read: (...a: unknown[]) => mockSolRead(...a) } }))
jest.mock('@/wallet/balances/evm', () => ({ evmBalanceReader: { read: (...a: unknown[]) => mockEvmRead(...a) } }))

import { readWalletBalances, sumUsdcRaw } from '@/wallet/balances'

function evmChain(id: string, name: string): ChainRegistryEntry {
  return {
    id, namespace: 'eip155', display_name: name, escrow_address: '0xEscrow',
    assets: [
      { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true },
      { id: 'ETH_BASE', symbol: 'ETH', decimals: 18, is_stable: false, token_address: null, supports_permit: false },
    ],
  }
}
const solChain: ChainRegistryEntry = {
  id: 'solana:devnet', namespace: 'solana', display_name: 'Solana Devnet', escrow_address: 'PROGRAM',
  assets: [
    { id: 'USDC_SOL', symbol: 'USDC', decimals: 6, is_stable: true, token_address: 'MINT', supports_permit: false },
    { id: 'SOL_DEVNET', symbol: 'SOL', decimals: 9, is_stable: false, token_address: null, supports_permit: false },
  ],
}

beforeEach(() => { mockSolRead.mockReset(); mockEvmRead.mockReset() })

test('fans an EVM wallet over every enabled EVM chain; sums USDC across them', async () => {
  mockEvmRead
    .mockResolvedValueOnce([{ assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: '48500000', decimals: 6, isStable: true }])
    .mockResolvedValueOnce([{ assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: '1500000', decimals: 6, isStable: true }])

  const out = await readWalletBalances(
    [{ chain_ns: 'eip155', address: '0xabc' }],
    [evmChain('eip155:8453', 'Base'), evmChain('eip155:42220', 'Celo')],
  )
  expect(out).toHaveLength(2)
  expect(out.map((b) => b.displayName).sort()).toEqual(['Base', 'Celo'])
  expect(out.map((b) => b.usdc?.amountRaw)).toEqual(['48500000', '1500000'])
  // 48.5 + 1.5 = 50 USDC → 50_000_000 base units.
  expect(sumUsdcRaw(out)).toBe('50000000')
})

test('only pairs wallets with same-namespace chains; picks USDC + native', async () => {
  mockSolRead.mockResolvedValue([
    { assetId: 'USDC_SOL', symbol: 'USDC', amountRaw: '80000000', decimals: 6, isStable: true },
    { assetId: 'SOL_DEVNET', symbol: 'SOL', amountRaw: '1200000000', decimals: 9, isStable: false },
  ])
  const out = await readWalletBalances([{ chain_ns: 'solana', address: 'SoL' }], [solChain, evmChain('eip155:8453', 'Base')])
  expect(mockEvmRead).not.toHaveBeenCalled() // no EVM wallet → EVM reader untouched
  expect(out).toHaveLength(1)
  expect(out[0].usdc?.amountRaw).toBe('80000000')
  expect(out[0].native?.amountRaw).toBe('1200000000')
})

test('a reader rejection is dropped, not thrown; sumUsdcRaw of nothing is 0', async () => {
  mockEvmRead.mockRejectedValue(new Error('rpc down'))
  const out = await readWalletBalances([{ chain_ns: 'eip155', address: '0xabc' }], [evmChain('eip155:8453', 'Base')])
  expect(out).toEqual([])
  expect(sumUsdcRaw(out)).toBe('0')
})
