import { test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { act } from '@testing-library/react'
import type { AdminResolutionView } from '@tenda/shared'
import { useResolution } from '@/hooks/use-resolution'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'

vi.mock('@/api/client', () => ({ adminApi: { disputes: { getResolution: vi.fn() } } }))

const getResolution = vi.mocked(adminApi.disputes.getResolution)

const proposal: AdminResolutionView = {
  id: 'r1', dispute_id: 'd1', proposed_winner: 'creator', proposed_by: 'm1',
  status: 'pending', threshold: 1, reject_reason: null, rejected_by: null,
  resolved_tx_ref: null, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
  chain_id: 'solana:devnet', dispute_admin_authority: 'C9PXauthority',
}

beforeEach(() => vi.clearAllMocks())

test('null dispute id stays idle', () => {
  const { result } = renderHook(() => useResolution(null))
  expect(result.current.loading).toBe(false)
  expect(result.current.resolution).toBeNull()
  expect(getResolution).not.toHaveBeenCalled()
})

test('loads the current proposal', async () => {
  getResolution.mockResolvedValueOnce(proposal)
  const { result } = renderHook(() => useResolution('d1'))
  expect(result.current.loading).toBe(true)
  await waitFor(() => expect(result.current.resolution).toEqual(proposal))
  expect(result.current.loading).toBe(false)
})

test('surfaces a load error', async () => {
  getResolution.mockRejectedValueOnce(new ApiError(500, 'X', 'boom'))
  const { result } = renderHook(() => useResolution('d1'))
  await waitFor(() => expect(result.current.error).toBe('boom'))
})

test('reload triggers a refetch', async () => {
  getResolution.mockResolvedValue(null)
  const { result } = renderHook(() => useResolution('d1'))
  await waitFor(() => expect(getResolution).toHaveBeenCalledTimes(1))
  act(() => result.current.reload())
  await waitFor(() => expect(getResolution).toHaveBeenCalledTimes(2))
})
