/**
 * useEscrowFee — the single source for every "X receives" projection. Pins:
 * tier selection (escrow's is_seeker → seeker_fee_bps), the contract's floor
 * division, BigInt exactness at 18-dp scale, and the not-loaded null contract.
 */
import { renderHook } from '@testing-library/react-native'

const mockConfigState: { config: { fee_bps: number; seeker_fee_bps: number; grace_period_seconds: number } | null } = {
  config: { fee_bps: 100, seeker_fee_bps: 50, grace_period_seconds: 172_800 },
}
const mockFetch = jest.fn(async () => mockConfigState.config)
jest.mock('@/stores/platform-config.store', () => ({
  usePlatformConfigStore: <T,>(selector: (s: {
    config: typeof mockConfigState.config
    loading: boolean
    error: string | null
    fetch: typeof mockFetch
  }) => T): T =>
    selector({ config: mockConfigState.config, loading: false, error: null, fetch: mockFetch }),
}))

import { useEscrowFee } from '../useEscrowFee'

afterEach(() => {
  mockConfigState.config = { fee_bps: 100, seeker_fee_bps: 50, grace_period_seconds: 172_800 }
  mockFetch.mockClear()
})

test('regular tier: fee = floor(principal × bps / 10000), net = principal − fee', () => {
  const { result } = renderHook(() => useEscrowFee(false, '2000000')) // 2 USDC (6dp)
  expect(result.current.feeBps).toBe(100)
  expect(result.current.feePct).toBe('1.00')
  expect(result.current.feeRaw).toBe(20_000n)
  expect(result.current.netRaw).toBe(1_980_000n)
})

test('seeker tier uses the DISCOUNTED bps — never the regular fee', () => {
  const { result } = renderHook(() => useEscrowFee(true, '2000000'))
  expect(result.current.feeBps).toBe(50)
  expect(result.current.feePct).toBe('0.50')
  expect(result.current.feeRaw).toBe(10_000n)
  expect(result.current.netRaw).toBe(1_990_000n)
})

test('floor division matches the contract (never rounds the fee up)', () => {
  // 999 base units at 1%: floor(9.99) = 9, net 990 — a ceil would say 10/989.
  const { result } = renderHook(() => useEscrowFee(false, '999'))
  expect(result.current.feeRaw).toBe(9n)
  expect(result.current.netRaw).toBe(990n)
})

test('18-dp principals stay BigInt-exact (no float precision loss)', () => {
  // 123456.789012345678901234 of an 18-dp asset.
  const { result } = renderHook(() => useEscrowFee(false, '123456789012345678901234'))
  expect(result.current.feeRaw).toBe(1234567890123456789012n)
  expect(result.current.netRaw).toBe(122222221122222222112222n)
})

test('config not loaded → all-null breakdown (callers must render "—", not 0)', () => {
  mockConfigState.config = null
  const { result } = renderHook(() => useEscrowFee(false, '2000000'))
  expect(result.current).toEqual({ feeBps: null, feePct: null, feeRaw: null, netRaw: null })
})

test('kicks off the config fetch on mount (self-sufficient on cold screens)', () => {
  renderHook(() => useEscrowFee(false, '1'))
  expect(mockFetch).toHaveBeenCalled()
})
