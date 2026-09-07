/**
 * usePostAuthReset, resets the root navigation container after sign-in so the
 * pushed auth screens leave history (Android back from home exits the app
 * instead of returning to welcome / connect-wallet). Verifies the reset target
 * per profile-completeness and the not-ready guard.
 */
const mockReset = jest.fn()
let mockReady = true
jest.mock('expo-router', () => ({
  useNavigationContainerRef: () => ({ isReady: () => mockReady, reset: mockReset }),
}))

import { renderHook } from '@testing-library/react-native'
import { usePostAuthReset, useReturnToLinkedWallets } from '@/lib/post-auth-nav'

beforeEach(() => {
  mockReset.mockClear()
  mockReady = true
})

describe('usePostAuthReset', () => {
  it('complete profile → resets the root to the (tabs) group', () => {
    renderHook(() => usePostAuthReset()).result.current(true)
    expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(tabs)' }] })
  })

  it('incomplete profile → resets into the (auth)/profile-setup screen', () => {
    renderHook(() => usePostAuthReset()).result.current(false)
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: '(auth)', state: { index: 0, routes: [{ name: 'profile-setup' }] } }],
    })
  })

  it('null profile flag is treated as incomplete (safe default → setup)', () => {
    renderHook(() => usePostAuthReset()).result.current(null)
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: '(auth)', state: { index: 0, routes: [{ name: 'profile-setup' }] } }],
    })
  })

  it('does nothing until the navigation container is ready', () => {
    mockReady = false
    renderHook(() => usePostAuthReset()).result.current(true)
    expect(mockReset).not.toHaveBeenCalled()
  })
})

describe('useReturnToLinkedWallets', () => {
  it('rebuilds the stack as [(tabs), settings/linked-wallets] (back → tabs)', () => {
    renderHook(() => useReturnToLinkedWallets()).result.current()
    expect(mockReset).toHaveBeenCalledWith({
      index: 1,
      routes: [{ name: '(tabs)' }, { name: 'settings/linked-wallets' }],
    })
  })

  it('does nothing until the navigation container is ready', () => {
    mockReady = false
    renderHook(() => useReturnToLinkedWallets()).result.current()
    expect(mockReset).not.toHaveBeenCalled()
  })
})
