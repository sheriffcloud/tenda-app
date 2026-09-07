/**
 * readAssetBalance — the targeted single-asset read behind the sufficiency
 * pre-flight. Verifies it routes to the namespace's reader, passes the
 * assetIds filter (the "one RPC" property), and returns null — meaning
 * UNKNOWN, never zero — when the asset is absent or the read comes back empty.
 */
import type { ChainRegistryEntry } from '@tenda/shared'

const mockSolRead = jest.fn()
const mockEvmRead = jest.fn()
jest.mock('@/wallet/balances/solana', () => ({ solanaBalanceReader: { read: (...a: unknown[]) => mockSolRead(...a) } }))
jest.mock('@/wallet/balances/evm', () => ({ evmBalanceReader: { read: (...a: unknown[]) => mockEvmRead(...a) } }))

import { readAssetBalance } from '@/wallet/balances/read-asset'

const evmChain: ChainRegistryEntry = {
  id: 'eip155:84532',
  namespace: 'eip155',
  display_name: 'Base Sepolia',
  escrow_address: '0xEscrow',
  assets: [
    { id: 'USDC_BASE', symbol: 'USDC', decimals: 6, is_stable: true, token_address: '0xT', supports_permit: true },
  ],
}
const solChain: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana Devnet',
  escrow_address: 'PROGRAM',
  assets: [
    { id: 'USDC_SOL', symbol: 'USDC', decimals: 6, is_stable: true, token_address: 'MINT', supports_permit: false },
  ],
}

const USDC_BASE = { assetId: 'USDC_BASE', symbol: 'USDC', amountRaw: '48500000', decimals: 6, isStable: true }

beforeEach(() => {
  mockSolRead.mockReset()
  mockEvmRead.mockReset()
})

test('routes to the namespace reader and filters to the one asset', async () => {
  mockEvmRead.mockResolvedValue([USDC_BASE])

  const out = await readAssetBalance('0xabc', evmChain, 'USDC_BASE')

  expect(mockEvmRead).toHaveBeenCalledWith('0xabc', evmChain, ['USDC_BASE'])
  expect(out).toEqual(USDC_BASE)
})

test('routes Solana chains to the Solana reader', async () => {
  mockSolRead.mockResolvedValue([{ ...USDC_BASE, assetId: 'USDC_SOL' }])

  const out = await readAssetBalance('SoLaddr', solChain, 'USDC_SOL')

  expect(mockSolRead).toHaveBeenCalledWith('SoLaddr', solChain, ['USDC_SOL'])
  expect(mockEvmRead).not.toHaveBeenCalled()
  expect(out?.assetId).toBe('USDC_SOL')
})

test('an empty read is UNKNOWN (null), not a zero balance', async () => {
  mockEvmRead.mockResolvedValue([])
  expect(await readAssetBalance('0xabc', evmChain, 'USDC_BASE')).toBeNull()
})

test('a reader that answers about a different asset yields null, not the wrong balance', async () => {
  mockEvmRead.mockResolvedValue([{ ...USDC_BASE, assetId: 'ETH_BASE' }])
  expect(await readAssetBalance('0xabc', evmChain, 'USDC_BASE')).toBeNull()
})

test('a genuine zero balance is reported as zero, not as unknown', async () => {
  mockEvmRead.mockResolvedValue([{ ...USDC_BASE, amountRaw: '0' }])

  const out = await readAssetBalance('0xabc', evmChain, 'USDC_BASE')

  expect(out).not.toBeNull()
  expect(out?.amountRaw).toBe('0')
})
