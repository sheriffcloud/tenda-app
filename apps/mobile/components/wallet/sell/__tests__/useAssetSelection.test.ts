/**
 * useAssetSelection — the shared asset/chain pick. Verifies it defaults to the
 * first tradable option, switches on select, and yields null when the user has
 * no tradable wallet.
 */
import { renderHook, act } from '@testing-library/react-native'
import type { ExchangeAssetOption } from '@/hooks/useExchangeAssetOptions'

let mockOptions: ExchangeAssetOption[] = []
jest.mock('@/hooks/useExchangeAssetOptions', () => ({ useExchangeAssetOptions: () => mockOptions }))
jest.mock('@/components/exchange/AssetChainPicker', () => ({
  optionKey: (o: { chainId: string; assetId: string }) => `${o.chainId}:${o.assetId}`,
}))

import { useAssetSelection } from '../useAssetSelection'

const A = { chainId: 'solana:devnet', assetId: 'USDC_SOL', symbol: 'USDC', decimals: 6, chainName: 'Solana', walletAddress: 'sol1' } as ExchangeAssetOption
const B = { chainId: 'eip155:84532', assetId: 'USDC_BASE', symbol: 'USDC', decimals: 6, chainName: 'Base', walletAddress: '0x' } as ExchangeAssetOption

beforeEach(() => { mockOptions = [A, B] })

test('defaults to the first option', () => {
  const { result } = renderHook(() => useAssetSelection())
  expect(result.current.option).toBe(A)
  expect(result.current.selectedKey).toBe('solana:devnet:USDC_SOL')
})

test('select switches the active option', () => {
  const { result } = renderHook(() => useAssetSelection())
  act(() => result.current.select(B))
  expect(result.current.option).toBe(B)
  expect(result.current.selectedKey).toBe('eip155:84532:USDC_BASE')
})

test('yields null option + empty key when there are no options', () => {
  mockOptions = []
  const { result } = renderHook(() => useAssetSelection())
  expect(result.current.option).toBeNull()
  expect(result.current.selectedKey).toBe('')
})
