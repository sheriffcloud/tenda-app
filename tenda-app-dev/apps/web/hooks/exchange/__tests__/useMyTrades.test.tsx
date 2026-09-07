/**
 * `useMyTrades` — the reader's own exchange escrows, shared between the
 * Trade surface and the dashboard (#60).
 */
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth.store'
import { myTradesCache } from '@/lib/account-state'
import { makeUser } from '../../../test/factories/user'

const escrows = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ api: { users: { escrows } } }))

import { useMyTrades } from '@/hooks/exchange/useMyTrades'

beforeEach(() => {
  escrows.mockReset()
  myTradesCache.clear()
  useAuthStore.setState({ user: makeUser({ id: 'me' }) })
})

it('reads MY exchange escrows, both sides, optionally narrowed to a chain', async () => {
  escrows.mockResolvedValue({ data: [], total: 0, limit: 20, offset: 0 })
  const { result } = renderHook(() => useMyTrades('solana:devnet'))
  await waitFor(() => expect(result.current.hasFetched).toBe(true))
  expect(escrows).toHaveBeenCalledWith({ id: 'me' }, expect.objectContaining({ kind: 'exchange', chain_id: 'solana:devnet' }))
})

it('never asks without a signed-in id — that would 403 on someone else’s escrows', async () => {
  useAuthStore.setState({ user: null })
  renderHook(() => useMyTrades())
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(escrows).not.toHaveBeenCalled()
})

it('can be held back explicitly, the way the Trade surface holds it until the chain is verified', async () => {
  renderHook(() => useMyTrades(null, false))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(escrows).not.toHaveBeenCalled()
})
