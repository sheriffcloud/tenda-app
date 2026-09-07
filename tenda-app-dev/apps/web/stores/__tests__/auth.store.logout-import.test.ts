import { expect, it, vi } from 'vitest'
import { JWT_TOKEN_KEY } from '@/lib/storage'

vi.mock('@/api/client', () => ({ api: {} }))
vi.mock('@/wallet/auth', () => ({ signInWithWallet: vi.fn(), linkWalletWith: vi.fn() }))
vi.mock('@/wallet/adapters/reown', () => {
  throw new Error('wallet chunk unavailable')
})

import { useAuthStore } from '@/stores/auth.store'

it('finishes logout when the optional wallet chunk cannot load', async () => {
  window.localStorage.setItem(JWT_TOKEN_KEY, 'jwt-1')
  useAuthStore.setState({
    jwt: 'jwt-1',
    isAuthenticated: true,
    isLoading: false,
  })

  await expect(useAuthStore.getState().logout()).resolves.toBeUndefined()
  expect(window.localStorage.getItem(JWT_TOKEN_KEY)).toBeNull()
  expect(useAuthStore.getState().isAuthenticated).toBe(false)
})
