/**
 * useEscrowFee — the single fee-projection source (settlement honesty: every
 * "X receives" figure runs through here). Null until config loads; tier
 * picked by the escrow's is_seeker; BigInt-exact net.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

const { configMock } = vi.hoisted(() => ({ configMock: vi.fn() }))
vi.mock('@/api/client', () => ({
  api: { platform: { config: (...a: unknown[]) => configMock(...a) } },
}))

import { useEscrowFee } from '@/hooks/escrow/useEscrowFee'
import { usePlatformConfigStore } from '@/stores/platform-config.store'

beforeEach(() => {
  usePlatformConfigStore.setState({ config: null, loading: false, error: null })
  configMock.mockResolvedValue({ fee_bps: 250, seeker_fee_bps: 100 })
})

test('null across the board until the platform config lands, then the standard tier', async () => {
  const { result } = renderHook(() => useEscrowFee(false, '10000000'))
  expect(result.current).toEqual({ feeBps: null, feePct: null, feeRaw: null, netRaw: null })
  await waitFor(() => expect(result.current.feeBps).toBe(250))
  expect(result.current.feePct).toBe('2.50')
  expect(result.current.feeRaw).toBe(BigInt(250_000))
  expect(result.current.netRaw).toBe(BigInt(9_750_000))
})

test('the seeker tier uses seeker_fee_bps', async () => {
  const { result } = renderHook(() => useEscrowFee(true, '10000000'))
  await waitFor(() => expect(result.current.feeBps).toBe(100))
  expect(result.current.feePct).toBe('1.00')
  expect(result.current.netRaw).toBe(BigInt(9_900_000))
})

test('BigInt-exact past 2^53 (18-decimal principals)', async () => {
  const { result } = renderHook(() => useEscrowFee(false, '1000000000000000001'))
  await waitFor(() => expect(result.current.feeRaw).not.toBeNull())
  // fee = floor(principal * 250 / 10000); net + fee must equal the principal.
  const { feeRaw, netRaw } = result.current
  expect((feeRaw as bigint) + (netRaw as bigint)).toBe(BigInt('1000000000000000001'))
})
