/**
 * Solana balance reader — native SOL via getBalance, SPL via getSplTokenBalance,
 * with the shared assetIds filter. @solana/web3.js and the wallet barrel are
 * stubbed (both pull native/ESM that Jest can't load), leaving the reader's own
 * logic under test: routing native vs SPL, the filter, a malformed address, and
 * one failing asset not sinking the rest.
 */
import type { ChainRegistryEntry } from '@tenda/shared'

/** Stands in for a PublicKey: records the input and rejects a bad address. */
interface FakePublicKey {
  value: string
}
jest.mock('@solana/web3.js', () => ({
  // Declared inside the factory — jest hoists mocks above module scope.
  PublicKey: class {
    value: string
    constructor(value: string) {
      if (value === 'not-base58') throw new Error('Invalid public key input')
      this.value = value
    }
  },
}))

const mockGetBalance = jest.fn()
const mockGetSplTokenBalance = jest.fn()
jest.mock('@/wallet', () => ({
  getBalance: (...a: unknown[]) => mockGetBalance(...a),
  getSplTokenBalance: (...a: unknown[]) => mockGetSplTokenBalance(...a),
}))

import { solanaBalanceReader } from '@/wallet/balances/solana'

const ADDR = 'SoLaddr1111111111111111111111111111111111111'
const MINT = 'MINT1111111111111111111111111111111111111111'

const chain: ChainRegistryEntry = {
  id: 'solana:devnet',
  namespace: 'solana',
  display_name: 'Solana Devnet',
  escrow_address: 'PROGRAM',
  assets: [
    { id: 'USDC_SOL', symbol: 'USDC', decimals: 6, is_stable: true, token_address: MINT, supports_permit: false },
    { id: 'SOL_DEVNET', symbol: 'SOL', decimals: 9, is_stable: false, token_address: null, supports_permit: false },
  ],
}

beforeEach(() => {
  mockGetBalance.mockReset().mockResolvedValue(2_000_000_000) // lamports, a number
  mockGetSplTokenBalance.mockReset().mockResolvedValue('48500000')
})

test('reads native SOL and SPL USDC, mapping each to base units as strings', async () => {
  const out = await solanaBalanceReader.read(ADDR, chain)

  expect(out).toEqual([
    { assetId: 'USDC_SOL', symbol: 'USDC', amountRaw: '48500000', decimals: 6, isStable: true },
    // getBalance answers a JS number; the reader must stringify, not arithmetic it.
    { assetId: 'SOL_DEVNET', symbol: 'SOL', amountRaw: '2000000000', decimals: 9, isStable: false },
  ])
})

test('the assetIds filter reads ONLY that asset — the pre-flight’s one RPC', async () => {
  const out = await solanaBalanceReader.read(ADDR, chain, ['USDC_SOL'])

  expect(out).toHaveLength(1)
  expect(out[0]?.assetId).toBe('USDC_SOL')
  expect(mockGetSplTokenBalance).toHaveBeenCalledTimes(1)
  expect(mockGetBalance).not.toHaveBeenCalled() // the native read never happened
})

test('filtering to the native asset skips the SPL read', async () => {
  const out = await solanaBalanceReader.read(ADDR, chain, ['SOL_DEVNET'])

  expect(out.map((b) => b.assetId)).toEqual(['SOL_DEVNET'])
  expect(mockGetSplTokenBalance).not.toHaveBeenCalled()
})

test('the SPL read is scoped to the asset’s mint and the owner', async () => {
  await solanaBalanceReader.read(ADDR, chain, ['USDC_SOL'])

  const [owner, mint] = mockGetSplTokenBalance.mock.calls[0] as [FakePublicKey, FakePublicKey]
  expect(owner.value).toBe(ADDR)
  expect(mint.value).toBe(MINT)
})

test('a malformed address reads nothing rather than throwing', async () => {
  expect(await solanaBalanceReader.read('not-base58', chain)).toEqual([])
  expect(mockGetBalance).not.toHaveBeenCalled()
})

test('one failing asset read is omitted, the others survive', async () => {
  mockGetSplTokenBalance.mockRejectedValue(new Error('rpc down'))

  const out = await solanaBalanceReader.read(ADDR, chain)

  expect(out.map((b) => b.assetId)).toEqual(['SOL_DEVNET'])
})

test('an unknown asset id yields an empty read, never a fabricated zero', async () => {
  expect(await solanaBalanceReader.read(ADDR, chain, ['USDC_BASE'])).toEqual([])
})
