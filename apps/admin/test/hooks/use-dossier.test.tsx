import { test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { AdminEscrowDossier } from '@tenda/shared'
import { useEscrowDossier } from '@/hooks/use-dossier'
import { adminApi } from '@/api/client'
import { ApiError } from '@/lib/api'

vi.mock('@/api/client', () => ({ adminApi: { escrows: { dossier: vi.fn() } } }))

const dossierFn = vi.mocked(adminApi.escrows.dossier)

const sample: AdminEscrowDossier = {
  escrow_id: 'e1', kind: 'gig', status: 'disputed', chain_id: 'solana:devnet',
  asset: 'USDC_SOL', amount_raw: '5000000', dispute_bond_raw: '0',
  created_at: '2026-06-10T00:00:00.000Z', parties: [], gig: null, exchange: null,
  proofs: [], transactions: [],
}

beforeEach(() => vi.clearAllMocks())

test('a null escrow id stays idle and never calls the API', () => {
  const { result } = renderHook(() => useEscrowDossier(null))
  expect(result.current).toEqual({ dossier: null, loading: false, error: null })
  expect(dossierFn).not.toHaveBeenCalled()
})

test('loads the dossier for an escrow id', async () => {
  dossierFn.mockResolvedValueOnce(sample)
  const { result } = renderHook(() => useEscrowDossier('e1'))
  expect(result.current.loading).toBe(true)
  await waitFor(() => expect(result.current.dossier).toEqual(sample))
  expect(result.current.loading).toBe(false)
  expect(result.current.error).toBeNull()
})

test('surfaces the API error message on failure', async () => {
  dossierFn.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'Escrow not found'))
  const { result } = renderHook(() => useEscrowDossier('missing'))
  await waitFor(() => expect(result.current.error).toBe('Escrow not found'))
  expect(result.current.dossier).toBeNull()
  expect(result.current.loading).toBe(false)
})

test('falls back to a generic message for a non-ApiError', async () => {
  dossierFn.mockRejectedValueOnce(new Error('boom'))
  const { result } = renderHook(() => useEscrowDossier('e1'))
  await waitFor(() => expect(result.current.error).toBe('Failed to load context'))
})

test('refetches when the escrow id changes', async () => {
  dossierFn.mockResolvedValue(sample)
  const { rerender } = renderHook((id: string) => useEscrowDossier(id), { initialProps: 'e1' })
  await waitFor(() => expect(dossierFn).toHaveBeenCalledWith('e1'))
  rerender('e2')
  await waitFor(() => expect(dossierFn).toHaveBeenCalledWith('e2'))
})
