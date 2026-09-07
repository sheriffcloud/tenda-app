/**
 * useExchangeAssetOptions — sellable (chain, asset) pairs. Regression-guards the
 * "Connect a wallet" bug (a verified linked wallet with no live session must
 * still yield options), plus stale-session fallback and the empty cases.
 */
import { renderHook } from '@testing-library/react-native'
import type { LinkedWallet } from '@tenda/shared'

interface Chain {
  id: string
  namespace: 'solana' | 'eip155'
  display_name: string
  assets: { id: string; symbol: string; decimals: number }[]
}

let mockChains: Chain[] | null = null
let mockSol: string | null = null
let mockEvm: string | null = null
let mockWallets: LinkedWallet[] = []

jest.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: (sel: (s: { chains: Chain[] | null }) => unknown) => sel({ chains: mockChains }),
}))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: { walletAddress: string | null; evmAddress: string | null; wallets: LinkedWallet[] }) => unknown) =>
    sel({ walletAddress: mockSol, evmAddress: mockEvm, wallets: mockWallets }),
}))
jest.mock('@tenda/shared', () => ({
  exchangeAssetsByChain: (id: string) =>
    id === 'solana:devnet' ? ['USDC_SOL'] : id === 'eip155:84532' ? ['USDC_BASE'] : [],
}))

import { useExchangeAssetOptions } from '@/hooks/useExchangeAssetOptions'

const SOL_CHAIN: Chain = {
  id: 'solana:devnet', namespace: 'solana', display_name: 'Solana',
  assets: [{ id: 'USDC_SOL', symbol: 'USDC', decimals: 6 }],
}
const EVM_CHAIN: Chain = {
  id: 'eip155:84532', namespace: 'eip155', display_name: 'Base',
  assets: [{ id: 'USDC_BASE', symbol: 'USDC', decimals: 6 }],
}
function evm(over: Partial<LinkedWallet>): LinkedWallet {
  return { chain_ns: 'eip155', address: '0xEvm', is_primary: false, verified_at: '2026-01-01T00:00:00Z', ...over }
}

beforeEach(() => {
  mockChains = [SOL_CHAIN, EVM_CHAIN]
  mockSol = null
  mockEvm = null
  mockWallets = []
})

test('null chain registry yields no options', () => {
  mockChains = null
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current).toEqual([])
})

test('no verified wallets yields no options', () => {
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current).toEqual([])
})

test('REGRESSION: a verified linked EVM wallet with no live session still yields the EVM option', () => {
  mockWallets = [evm({ address: '0xEvm', is_primary: true })]
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current).toHaveLength(1)
  expect(result.current[0]).toMatchObject({ chainId: 'eip155:84532', assetId: 'USDC_BASE', walletAddress: '0xEvm' })
})

test('a stale session address is ignored; the option uses the primary linked wallet', () => {
  mockEvm = '0xStale'
  mockWallets = [evm({ address: '0xPrimary', is_primary: true })]
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current[0].walletAddress).toBe('0xPrimary')
})

test('resolves a verified solana wallet for the solana chain', () => {
  mockWallets = [{ chain_ns: 'solana', address: 'SoLAddr', is_primary: true, verified_at: '2026-01-01T00:00:00Z' }]
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current).toHaveLength(1)
  expect(result.current[0]).toMatchObject({ chainId: 'solana:devnet', walletAddress: 'SoLAddr' })
})

test('omits a held asset that is not exchange-eligible on its chain', () => {
  // The EVM chain also carries a non-tradable asset; only USDC_BASE is eligible.
  mockChains = [
    { ...EVM_CHAIN, assets: [...EVM_CHAIN.assets, { id: 'JUNK', symbol: 'JUNK', decimals: 18 }] },
  ]
  mockWallets = [evm({ address: '0xEvm', is_primary: true })]
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.map((o) => o.assetId)).toEqual(['USDC_BASE'])
})

test('lists options across every chain the user has a verified wallet for', () => {
  mockWallets = [
    evm({ address: '0xEvm', is_primary: true }),
    { chain_ns: 'solana', address: 'SoLAddr', is_primary: true, verified_at: '2026-01-01T00:00:00Z' },
  ]
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.map((o) => o.chainId).sort()).toEqual(['eip155:84532', 'solana:devnet'])
})
