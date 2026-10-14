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
// DECLARED, not omitted (#60): the hook now reports WHY the list is empty, and
// a mock missing the two statuses makes every cause look like the same one —
// which is the defect it exists to end. `ensureLoaded`/`refreshMe` are here for
// the same reason: the hook loads what it reasons over.
let mockChainsStatus = 'ready'
let mockWalletsStatus = 'ready'
const mockEnsureLoaded = jest.fn(async () => {})
const mockRefreshMe = jest.fn(async () => {})

interface ChainStore { chains: Chain[] | null; status: string; ensureLoaded: () => Promise<void> }
interface AuthStore {
  walletAddress: string | null
  evmAddress: string | null
  wallets: LinkedWallet[]
  walletsStatus: string
  refreshMe: () => Promise<void>
}
const authState = (): AuthStore => ({
  walletAddress: mockSol,
  evmAddress: mockEvm,
  wallets: mockWallets,
  walletsStatus: mockWalletsStatus,
  refreshMe: mockRefreshMe,
})

jest.mock('@/stores/chain-registry.store', () => ({
  useChainRegistryStore: (sel: (s: ChainStore) => unknown) =>
    sel({ chains: mockChains, status: mockChainsStatus, ensureLoaded: mockEnsureLoaded }),
}))
jest.mock('@/stores/auth.store', () => {
  const useAuthStore = (sel: (s: AuthStore) => unknown) => sel(authState())
  useAuthStore.getState = () => authState()
  return { useAuthStore }
})
// Partial: the hook also runs the REAL pickWalletAddress (moved to shared,
// 2026-08-15) — its trust rules are part of what these tests exercise.
jest.mock('@tenda/shared', () => ({
  ...jest.requireActual('@tenda/shared'),
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
  jest.clearAllMocks()
  mockChains = [SOL_CHAIN, EVM_CHAIN]
  mockSol = null
  mockEvm = null
  mockWallets = []
  mockChainsStatus = 'ready'
  mockWalletsStatus = 'ready'
})

test('null chain registry yields no options', () => {
  mockChains = null
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.options).toEqual([])
})

test('no verified wallets yields no options', () => {
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.options).toEqual([])
})

test('REGRESSION: a verified linked EVM wallet with no live session still yields the EVM option', () => {
  mockWallets = [evm({ address: '0xEvm', is_primary: true })]
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.options).toHaveLength(1)
  expect(result.current.options[0]).toMatchObject({ chainId: 'eip155:84532', assetId: 'USDC_BASE', walletAddress: '0xEvm' })
})

test('a stale session address is ignored; the option uses the primary linked wallet', () => {
  mockEvm = '0xStale'
  mockWallets = [evm({ address: '0xPrimary', is_primary: true })]
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.options[0].walletAddress).toBe('0xPrimary')
})

test('resolves a verified solana wallet for the solana chain', () => {
  mockWallets = [{ chain_ns: 'solana', address: 'SoLAddr', is_primary: true, verified_at: '2026-01-01T00:00:00Z' }]
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.options).toHaveLength(1)
  expect(result.current.options[0]).toMatchObject({ chainId: 'solana:devnet', walletAddress: 'SoLAddr' })
})

test('omits a held asset that is not exchange-eligible on its chain', () => {
  // The EVM chain also carries a non-tradable asset; only USDC_BASE is eligible.
  mockChains = [
    { ...EVM_CHAIN, assets: [...EVM_CHAIN.assets, { id: 'JUNK', symbol: 'JUNK', decimals: 18 }] },
  ]
  mockWallets = [evm({ address: '0xEvm', is_primary: true })]
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.options.map((o) => o.assetId)).toEqual(['USDC_BASE'])
})

test('lists options across every chain the user has a verified wallet for', () => {
  mockWallets = [
    evm({ address: '0xEvm', is_primary: true }),
    { chain_ns: 'solana', address: 'SoLAddr', is_primary: true, verified_at: '2026-01-01T00:00:00Z' },
  ]
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.options.map((o) => o.chainId).sort()).toEqual(['eip155:84532', 'solana:devnet'])
})

// ---------- WHY the list is empty (#60) --------------------------------------

test('a settled, wallet-less account is the only case that says "no wallet"', () => {
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.options).toEqual([])
  expect(result.current.section).toBe('no-wallet')
})

test('with something tradable the surface is ready and says nothing', () => {
  mockWallets = [evm({ address: '0xEvm', is_primary: true })]
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.section).toBe('ready')
})

test('an unsettled WALLETS load is loading, never an accusation', () => {
  // The bug this closes: on a cold deep-link to the sell screen neither load
  // had run, and the surface told a reader with a linked wallet to link one.
  for (const status of ['idle', 'loading'] as const) {
    mockWalletsStatus = status
    const { result, unmount } = renderHook(() => useExchangeAssetOptions())
    expect(result.current.section).toBe('loading')
    unmount()
  }
})

test('a FAILED wallets load is its own state', () => {
  mockWalletsStatus = 'error'
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.section).toBe('wallets-error')
})

test('a FAILED registry blames the registry, never the reader', () => {
  // The exact miss this test used to allow: it asserted only `not ready` and
  // `not wallets-error`, which 'no-wallet' satisfies — and 'no-wallet' is what
  // the wallet screen's ordering actually returned here, telling a reader who
  // HAS a verified wallet to link one because OUR chains request failed.
  mockWallets = [evm({ address: '0xEvm', is_primary: true })]
  mockChains = null
  mockChainsStatus = 'error'
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.section).toBe('balances-unavailable')
})

test('a registry still in flight is loading, not a verdict on the reader', () => {
  mockWallets = [evm({ address: '0xEvm', is_primary: true })]
  mockChains = null
  mockChainsStatus = 'loading'
  const { result } = renderHook(() => useExchangeAssetOptions())
  expect(result.current.section).toBe('loading')
})

test('it LOADS what it reasons over — neither the screen nor a neighbour does', () => {
  mockWalletsStatus = 'idle'
  renderHook(() => useExchangeAssetOptions())
  expect(mockEnsureLoaded).toHaveBeenCalledTimes(1)
  expect(mockRefreshMe).toHaveBeenCalledTimes(1)
})

test('a settled wallets list is not refetched on every visit', () => {
  // refreshMe is NOT deduped, so the status check is what stops the sell
  // screen refetching the account each time it opens.
  mockWalletsStatus = 'ready'
  renderHook(() => useExchangeAssetOptions())
  expect(mockRefreshMe).not.toHaveBeenCalled()
})
